const { Worker } = require('bullmq');
const { PassThrough } = require('stream');
const { Upload } = require('@aws-sdk/lib-storage');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const { 
    redis, 
    exportQueue, 
    emailQueue,
    Project, 
    getConnection, 
    getCompiledModel,
    getS3CompatibleStorage,
    getBucket
} = require('@urbackend/common');

const initExportWorker = () => {
    const worker = new Worker(exportQueue.name, async (job) => {
        const { projectId, userId, email } = job.data;
        console.log(`[ExportWorker] Starting export for project ${projectId} requested by ${email}`);

        const project = await Project.findById(projectId);
        if (!project) throw new Error('Project not found');

        const connection = await getConnection(projectId);
        
        console.log(`[ExportWorker] Preparing streaming upload to storage...`);
        
        const { s3Client } = await getS3CompatibleStorage(project);
        const bucket = await getBucket(project);
        const storagePath = `${projectId}/exports/db_export_${Date.now()}.json`;

        const passThrough = new PassThrough();

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: bucket,
                Key: storagePath,
                Body: passThrough,
                ContentType: 'application/json'
            }
        });

        // Start the upload promise in parallel
        const uploadPromise = upload.done();

        try {
            passThrough.write('{\n');
            
            for (let i = 0; i < project.collections.length; i++) {
                const col = project.collections[i];
                const Model = getCompiledModel(connection, col, projectId, project.resources.db.isExternal);
                
                passThrough.write(`  "${col.name}": [\n`);
                
                // use a mongoose cursor to stream documents one by one
                const cursor = Model.find().lean().cursor();
                let first = true;
                
                for await (const doc of cursor) {
                    if (!first) passThrough.write(',\n');
                    passThrough.write(`    ${JSON.stringify(doc)}`);
                    first = false;
                }
                
                passThrough.write('\n  ]');
                if (i < project.collections.length - 1) passThrough.write(',\n');
            }
            
            passThrough.write('\n}\n');
            passThrough.end();

            console.log(`[ExportWorker] Database stream ended. Awaiting final storage upload chunks...`);
            await uploadPromise;

            // create a signed URL valid for 24 hrs (86400 seconds)
            const command = new GetObjectCommand({ Bucket: bucket, Key: storagePath });
            const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 86400 });

            // queue the email to be sent to the user
            await emailQueue.add('send-export-email', { email, downloadUrl: signedUrl, projectName: project.name });
            console.log(`[ExportWorker] Export completed! Email queued for ${email}`);

        } catch (error) {
            passThrough.destroy(error);
            throw error;
        }
    }, { connection: redis, concurrency: 2 });

    worker.on('completed', (job) => {
        console.log(`[ExportWorker] Job ${job.id} for project ${job.data.projectId} completed.`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[ExportWorker] Job ${job?.id} for project ${job?.data?.projectId} failed:`, err.message);
    });

    return worker;
};

module.exports = { initExportWorker };