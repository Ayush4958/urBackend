const { Queue, Worker } = require('bullmq');
const connection = require('../config/redis');
const Project = require('../models/Project');
const { getConnection } = require('../utils/connection.manager');
const { getCompiledModel } = require('../utils/injectModel');

const QUEUE_NAME = 'trash-cleanup-queue';

const trashCleanupQueue = new Queue(QUEUE_NAME, { connection });

/**
 * Schedule the daily trash cleanup job.
 * Runs at 03:00 IST every day.
 */
async function scheduleTrashCleanup() {
  const existing = await trashCleanupQueue.getRepeatableJobs();
  for (const job of existing) {
    if (job.name === 'daily-trash-cleanup') {
      await trashCleanupQueue.removeRepeatableByKey(job.key);
    }
  }

  await trashCleanupQueue.add(
    'daily-trash-cleanup',
    {},
    {
      repeat: { 
        pattern: '0 3 * * *', // 03:00 IST daily
        tz: 'Asia/Kolkata',
      },
      removeOnComplete: true,
      removeOnFail: { count: 10 },
    },
  );
  console.log('[TrashCleanup] Daily cron scheduled (03:00 IST)');
}

/**
 * Run the trash cleanup logic.
 */
async function runTrashCleanup() {
  console.log('[TrashCleanup] Starting daily cleanup...');
  
  const projects = await Project.find({}).lean();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  for (const project of projects) {
    try {
      const projectConn = await getConnection(project._id);
      let totalSpaceReclaimed = 0;

      for (const collectionConfig of project.collections) {
        const Model = getCompiledModel(
          projectConn,
          collectionConfig,
          project._id,
          project.resources.db.isExternal
        );

        const deleteFilter = {
          isDeleted: true,
          deletedAt: { $lt: thirtyDaysAgo },
        };

        // Find documents to be hard-deleted
        const docsToDelete = await Model.find(deleteFilter).lean();

        if (docsToDelete.length > 0) {
          console.log(`[TrashCleanup] Deleting ${docsToDelete.length} documents from ${project.name}.${collectionConfig.name}`);
          const idsToDelete = docsToDelete.map((doc) => doc._id);

          await Model.deleteMany({
            _id: { $in: idsToDelete },
            ...deleteFilter,
          });

          if (!project.resources.db.isExternal) {
            const remainingDocs = await Model.find({ _id: { $in: idsToDelete } })
              .select('_id')
              .lean();
            const remainingIds = new Set(remainingDocs.map((doc) => doc._id.toString()));

            let reclaimedForCollection = 0;
            for (const doc of docsToDelete) {
              if (!remainingIds.has(doc._id.toString())) {
                reclaimedForCollection += Buffer.byteLength(JSON.stringify(doc));
              }
            }

            totalSpaceReclaimed += reclaimedForCollection;
          }
        }
      }

      if (totalSpaceReclaimed > 0 && !project.resources.db.isExternal) {
        await Project.updateOne(
          { _id: project._id },
          { $inc: { databaseUsed: -totalSpaceReclaimed } }
        );
        // Ensure databaseUsed doesn't go below 0
        await Project.updateOne(
            { _id: project._id, databaseUsed: { $lt: 0 } },
            { $set: { databaseUsed: 0 } }
        );
      }
    } catch (err) {
      console.error(`[TrashCleanup] Failed to clean trash for project ${project._id}:`, err.message);
    }
  }

  console.log('[TrashCleanup] Daily cleanup finished.');
}

/**
 * Initialize the BullMQ worker for trash cleanup.
 */
function initTrashCleanupWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await runTrashCleanup();
    },
    { connection, concurrency: 1 }
  );

  worker.on('completed', () => console.log('[TrashCleanup] Job completed successfully'));
  worker.on('failed', (job, err) =>
    console.error('[TrashCleanup] Job failed:', err.message)
  );

  console.log('[TrashCleanup] Worker initialized');
  return worker;
}

module.exports = {
  trashCleanupQueue,
  scheduleTrashCleanup,
  initTrashCleanupWorker,
  runTrashCleanup
};
