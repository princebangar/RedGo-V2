import { sendResponse } from '../../../../utils/response.js';
import {
    listComboOffersAdmin,
    searchComboCandidateFoods,
    addComboOffer,
    addComboOffersBulk,
    removeComboOffer,
    removeComboOffersBulk,
    updateComboOfferOrder,
    toggleComboOfferStatus,
    getPublicComboOffers
} from '../services/comboOffer.service.js';

export async function listComboOffers(req, res, next) {
    try {
        const comboOffers = await listComboOffersAdmin();
        return sendResponse(res, 200, 'Combo offers fetched', { comboOffers });
    } catch (error) {
        next(error);
    }
}

export async function searchComboFoods(req, res, next) {
    try {
        const foods = await searchComboCandidateFoods(req.query || {});
        return sendResponse(res, 200, 'Foods fetched', { foods });
    } catch (error) {
        next(error);
    }
}

export async function createComboOffer(req, res, next) {
    try {
        const comboOffer = await addComboOffer(req.body || {});
        return sendResponse(res, 201, 'Combo offer added', { comboOffer });
    } catch (error) {
        next(error);
    }
}

export async function bulkAddComboOffers(req, res, next) {
    try {
        const data = await addComboOffersBulk(req.body || {});
        return sendResponse(res, 201, `${data.added} combo ${data.added === 1 ? 'offer' : 'offers'} added`, data);
    } catch (error) {
        next(error);
    }
}

export async function bulkRemoveComboOffers(req, res, next) {
    try {
        const data = await removeComboOffersBulk(req.body || {});
        return sendResponse(res, 200, `${data.removed} combo ${data.removed === 1 ? 'offer' : 'offers'} removed`, data);
    } catch (error) {
        next(error);
    }
}

export async function deleteComboOffer(req, res, next) {
    try {
        const data = await removeComboOffer(req.params.id);
        return sendResponse(res, 200, 'Combo offer removed', data);
    } catch (error) {
        next(error);
    }
}

export async function updateComboOrder(req, res, next) {
    try {
        const comboOffer = await updateComboOfferOrder(req.params.id, req.body?.order);
        return sendResponse(res, 200, 'Order updated', { comboOffer });
    } catch (error) {
        next(error);
    }
}

export async function toggleComboStatus(req, res, next) {
    try {
        const comboOffer = await toggleComboOfferStatus(req.params.id);
        return sendResponse(res, 200, comboOffer.isActive ? 'Activated' : 'Deactivated', { comboOffer });
    } catch (error) {
        next(error);
    }
}

/** Public (no auth): GET /food/combo-offers/public?zoneId= */
export async function getPublicComboOffersController(req, res, next) {
    try {
        const comboOffers = await getPublicComboOffers({ zoneId: req.query?.zoneId });
        return sendResponse(res, 200, 'Combo offers fetched', { comboOffers });
    } catch (error) {
        next(error);
    }
}
