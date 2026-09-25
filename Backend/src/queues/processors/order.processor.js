import mongoose from 'mongoose';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/env.js';

// The order worker is a separate process: it has no MongoDB connection and no Socket.IO of its
// own. Dispatch-timeout jobs need both (DB reads/writes + real-time rider events), so set them up
// once, lazily, the first time such a job runs.
let workerRuntime = null;
const ensureWorkerRuntime = () => {
    if (!workerRuntime) {
        workerRuntime = (async () => {
            if (mongoose.connection.readyState === 0) {
                await mongoose.connect(config.mongodbUri, {
                    serverSelectionTimeoutMS: 10000,
                    socketTimeoutMS: 45000,
                    heartbeatFrequencyMS: 10000,
                    retryWrites: true,
                });
                logger.info('[BullMQ:order] MongoDB connected');
            }
            const { initEmitterSocket } = await import('../../config/socket.js');
            await initEmitterSocket();
        })().catch((err) => {
            workerRuntime = null; // let the next job try again
            throw err;
        });
    }
    return workerRuntime;
};

/**
 * BullMQ processor for order lifecycle jobs.
 *
 * Current implementation is intentionally logging-only to avoid changing API behavior.
 * @param {import('bullmq').Job} job
 */
export const processOrderJob = async (job) => {
    const data = job?.data || {};
    const action = data.action || 'unknown';
    const orderId = data.orderId || '';
    const orderMongoId = data.orderMongoId || '';

    logger.info(
        `[BullMQ:order] action=${action} jobId=${job.id} orderId=${orderId} orderMongoId=${orderMongoId}`
    );

    // Handle Smart Dispatch Timeout
    if (action === 'DISPATCH_TIMEOUT_CHECK') {
        try {
            await ensureWorkerRuntime();
            const { processDispatchTimeout } = await import('../../modules/food/orders/services/order.service.js');
            // Pass full data object to allow attempt count and other options
            await processDispatchTimeout(orderMongoId, data.partnerId, data);
        } catch (err) {
            logger.error(`[BullMQ:order] DISPATCH_TIMEOUT_CHECK failed: ${err.message}`);
        }
    }


    return { processed: true, action, jobId: job.id };
};
