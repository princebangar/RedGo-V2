import { deleteRestaurantAccount } from '../services/deleteAccount.service.js';
import { sendResponse, sendError } from '../../../../utils/response.js';

export async function deleteRestaurantAccountController(req, res) {
    try {
        const userId = req.user?.userId;
        if (!userId) return sendError(res, 401, 'Authentication required');

        const result = await deleteRestaurantAccount(userId);
        return sendResponse(res, 200, result.message, null);
    } catch (error) {
        console.error('[deleteRestaurantAccount] Error:', error.message);
        return sendError(res, 500, error.message || 'Failed to delete account');
    }
}
