import { deleteDeliveryAccount } from '../services/deleteAccount.service.js';
import { sendResponse, sendError } from '../../../../utils/response.js';

export async function deleteDeliveryAccountController(req, res) {
    try {
        const userId = req.user?.userId;
        if (!userId) return sendError(res, 401, 'Authentication required');

        const result = await deleteDeliveryAccount(userId);
        return sendResponse(res, 200, result.message, null);
    } catch (error) {
        console.error('[deleteDeliveryAccount] Error:', error.message);
        return sendError(res, 500, error.message || 'Failed to delete account');
    }
}
