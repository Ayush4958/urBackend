const dotenv = require('dotenv');
dotenv.config({ path: require('path').join(__dirname, '../../../.env') });

const { validateEnv } = require('@urbackend/common');

if (process.env.NODE_ENV !== 'test') {
    validateEnv();
}

const { initExportWorker } = require('./workers/export.worker');

const { connectDB } = require('@urbackend/common');

    (async () => {
        try {
            await connectDB();

            const worker = initExportWorker();

            console.log('[CONSUMER] Export worker started and listening for jobs...');

            const shutdown = async () => {
                console.log('Shutting down worker...');
                await worker.close();
                process.exit(0);
            };

            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);

        } catch (err) {
            console.error('Failed to start worker:', err);
            process.exit(1);
        }
    })();