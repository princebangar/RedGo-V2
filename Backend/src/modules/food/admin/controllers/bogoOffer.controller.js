import { sendResponse } from '../../../../utils/response.js';
import {
    listBogoOffersAdmin,
    searchBogoCandidateFoods,
    addBogoOffer,
    addBogoOffersBulk,
    removeBogoOffer,
    removeBogoOffersBulk,
    addBogoOffersByFilter,
    removeBogoOffersByFilter,
    listBogoRestaurants,
    addBogoOffersForRestaurants,
    removeBogoOffersForRestaurants,
    updateBogoOfferOrder,
    updateBogoOfferLimit,
    getBogoDefaultLimits,
    saveBogoDefaultLimits,
    toggleBogoOfferStatus
} from '../services/bogoOffer.service.js';

export async function listBogoOffers(req, res, next) {
    try {
        const bogoOffers = await listBogoOffersAdmin();
        return sendResponse(res, 200, 'BOGO offers fetched', { bogoOffers });
    } catch (error) {
        next(error);
    }
}

export async function searchBogoFoods(req, res, next) {
    try {
        const data = await searchBogoCandidateFoods(req.query || {});
        return sendResponse(res, 200, 'Foods fetched', data);
    } catch (error) {
        next(error);
    }
}

export async function addBogoByFilter(req, res, next) {
    try {
        const data = await addBogoOffersByFilter(req.body || {});
        return sendResponse(res, 201, `${data.added} BOGO ${data.added === 1 ? 'offer' : 'offers'} added`, data);
    } catch (error) {
        next(error);
    }
}

export async function removeBogoByFilter(req, res, next) {
    try {
        const data = await removeBogoOffersByFilter(req.body || {});
        return sendResponse(res, 200, `${data.removed} BOGO ${data.removed === 1 ? 'offer' : 'offers'} removed`, data);
    } catch (error) {
        next(error);
    }
}

export async function createBogoOffer(req, res, next) {
    try {
        const bogoOffer = await addBogoOffer(req.body || {});
        return sendResponse(res, 201, 'BOGO offer added', { bogoOffer });
    } catch (error) {
        next(error);
    }
}

export async function bulkAddBogoOffers(req, res, next) {
    try {
        const data = await addBogoOffersBulk(req.body || {});
        return sendResponse(res, 201, `${data.added} BOGO ${data.added === 1 ? 'offer' : 'offers'} added`, data);
    } catch (error) {
        next(error);
    }
}

export async function listBogoRestaurantsHandler(req, res, next) {
    try {
        const restaurants = await listBogoRestaurants(req.query || {});
        return sendResponse(res, 200, 'Restaurants fetched', { restaurants });
    } catch (error) {
        next(error);
    }
}

export async function addBogoRestaurants(req, res, next) {
    try {
        const data = await addBogoOffersForRestaurants(req.body || {});
        return sendResponse(res, 201, `${data.added} BOGO ${data.added === 1 ? 'offer' : 'offers'} added`, data);
    } catch (error) {
        next(error);
    }
}

export async function removeBogoRestaurants(req, res, next) {
    try {
        const data = await removeBogoOffersForRestaurants(req.body || {});
        return sendResponse(res, 200, `${data.removed} BOGO ${data.removed === 1 ? 'offer' : 'offers'} removed`, data);
    } catch (error) {
        next(error);
    }
}

export async function bulkRemoveBogoOffers(req, res, next) {
    try {
        const data = await removeBogoOffersBulk(req.body || {});
        return sendResponse(res, 200, `${data.removed} BOGO ${data.removed === 1 ? 'offer' : 'offers'} removed`, data);
    } catch (error) {
        next(error);
    }
}

export async function deleteBogoOffer(req, res, next) {
    try {
        const data = await removeBogoOffer(req.params.id);
        return sendResponse(res, 200, 'BOGO offer removed', data);
    } catch (error) {
        next(error);
    }
}

export async function updateBogoOrder(req, res, next) {
    try {
        const bogoOffer = await updateBogoOfferOrder(req.params.id, req.body?.order);
        return sendResponse(res, 200, 'Order updated', { bogoOffer });
    } catch (error) {
        next(error);
    }
}

export async function updateBogoLimit(req, res, next) {
    try {
        const bogoOffer = await updateBogoOfferLimit(req.params.id, req.body || {});
        return sendResponse(res, 200, 'Offer limits updated', { bogoOffer });
    } catch (error) {
        next(error);
    }
}

export async function getBogoDefaults(req, res, next) {
    try {
        const defaults = await getBogoDefaultLimits();
        return sendResponse(res, 200, 'Default limits fetched', { defaults });
    } catch (error) {
        next(error);
    }
}

export async function saveBogoDefaults(req, res, next) {
    try {
        const defaults = await saveBogoDefaultLimits(req.body || {}, {
            role: req.user?.role || 'ADMIN',
            adminId: req.user?._id
        });
        return sendResponse(res, 200, 'Default limits saved', { defaults });
    } catch (error) {
        next(error);
    }
}

export async function toggleBogoStatus(req, res, next) {
    try {
        const bogoOffer = await toggleBogoOfferStatus(req.params.id);
        return sendResponse(res, 200, bogoOffer.isActive ? 'Activated' : 'Deactivated', { bogoOffer });
    } catch (error) {
        next(error);
    }
}
