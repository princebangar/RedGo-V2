import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodDiningBooking } from '../models/diningBooking.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';

// Format database booking document into the exact JSON shape required by the frontend
function formatBooking(bookingDoc) {
    if (!bookingDoc) return null;
    const booking = bookingDoc.toObject ? bookingDoc.toObject() : bookingDoc;
    
    // Format restaurant details
    let restaurantObj = null;
    if (booking.restaurantId && typeof booking.restaurantId === 'object') {
        const rest = booking.restaurantId;
        const coverImage = Array.isArray(rest.coverImages)
            ? rest.coverImages.map(img => typeof img === 'string' ? img : img?.url || '').find(Boolean)
            : '';
        const profilePhoto = typeof rest.profileImage === 'string'
            ? rest.profileImage
            : (rest.profileImage?.url || '');

        restaurantObj = {
            _id: rest._id,
            id: rest._id,
            name: rest.restaurantName || rest.name || 'Restaurant',
            restaurantName: rest.restaurantName || rest.name || 'Restaurant',
            profileImage: rest.profileImage || null,
            image: coverImage || profilePhoto || '',
            location: rest.location || null,
            slug: rest.slug || ''
        };
    } else if (booking.restaurantId) {
        restaurantObj = {
            _id: booking.restaurantId,
            id: booking.restaurantId,
            name: 'Restaurant',
            restaurantName: 'Restaurant',
            profileImage: null,
            image: '',
            location: null,
            slug: ''
        };
    }

    // Format user details
    let userObj = null;
    if (booking.userId && typeof booking.userId === 'object') {
        const u = booking.userId;
        userObj = {
            _id: u._id,
            id: u._id,
            name: u.name || 'Guest',
            phone: u.phone || '',
            email: u.email || ''
        };
    } else if (booking.userId) {
        userObj = {
            _id: booking.userId,
            id: booking.userId,
            name: 'Guest',
            phone: '',
            email: ''
        };
    }

    return {
        _id: booking._id,
        id: booking._id,
        bookingId: booking.bookingId,
        restaurantId: booking.restaurantId?._id || booking.restaurantId,
        restaurant: restaurantObj,
        userId: booking.userId?._id || booking.userId,
        user: userObj,
        guests: booking.guests,
        date: booking.date,
        timeSlot: booking.timeSlot,
        specialRequest: booking.specialRequest || '',
        status: booking.status || 'pending',
        review: booking.review || null,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt
    };
}

export async function createBooking(userId, payload) {
    const restaurantId = payload.restaurant || payload.restaurantId;
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
        throw new Error('Valid Restaurant ID is required');
    }

    const restaurant = await FoodRestaurant.findById(restaurantId).lean();
    if (!restaurant) {
        throw new Error('Restaurant not found');
    }

    const guests = Math.max(1, Number(payload.guests) || 1);
    const date = new Date(payload.date);
    const timeSlot = String(payload.timeSlot || '').trim();

    // Seats are counted per restaurant + day + time slot against the restaurant's guest limit.
    const capacity = Math.max(0, Number(restaurant.diningSettings?.maxGuests) || 0);
    if (capacity > 0 && timeSlot && !Number.isNaN(date.getTime())) {
        const taken = await getBookedSeatsForSlot(restaurantId, date, timeSlot);
        const left = Math.max(0, capacity - taken);
        if (left <= 0) throw new ValidationError('This time slot is full. Please choose another slot.');
        if (guests > left) throw new ValidationError(`Only ${left} seat${left === 1 ? '' : 's'} left in this time slot.`);
    }

    // Generate unique display-friendly booking ID: TB + 8 digits
    const uniqueDigits = Math.floor(10000000 + Math.random() * 90000000);
    const bookingId = `TB${uniqueDigits}`;

    const newBooking = new FoodDiningBooking({
        bookingId,
        restaurantId,
        userId,
        guests,
        date,
        timeSlot,
        specialRequest: String(payload.specialRequest || '').trim(),
        status: 'pending'
    });

    await newBooking.save();

    // Populate relations to match frontend structure
    const populated = await FoodDiningBooking.findById(newBooking._id)
        .populate('restaurantId')
        .populate('userId');

    const formatted = formatBooking(populated);
    void notifyRestaurantAboutBooking(restaurantId, formatted);
    return formatted;
}

/** "07:00 PM", "7:00 pm" and "19:00" are the same slot: compare minutes since midnight. */
const slotMinutes = (value) => {
    const m = String(value || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i);
    if (!m) return null;
    let h = Number(m[1]) % 24;
    const min = Number(m[2] || 0);
    const ap = (m[3] || '').toLowerCase().replace(/\./g, '');
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return h * 60 + min;
};

/** Guests already booked (pending/confirmed) for one restaurant, day and time slot. */
export async function getBookedSeatsForSlot(restaurantId, date, timeSlot) {
    const day = new Date(date);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const wanted = slotMinutes(timeSlot);
    const bookings = await FoodDiningBooking.find({
        restaurantId,
        date: { $gte: start, $lt: end },
        status: { $in: ['pending', 'accepted', 'confirmed', 'checked-in'] }
    }).select('guests timeSlot').lean();
    return bookings
        .filter((b) => (wanted === null ? b.timeSlot === timeSlot : slotMinutes(b.timeSlot) === wanted))
        .reduce((sum, b) => sum + (Number(b.guests) || 0), 0);
}

/** New table request: live popup + ring in the restaurant app, a push, and an inbox message. */
async function notifyRestaurantAboutBooking(restaurantId, booking) {
    const title = 'New Table Request';
    const body = `${booking?.user?.name || 'A guest'} booked a table for ${booking?.guests || 1} at ${booking?.timeSlot || ''}`.trim();
    try {
        const { getIO, rooms } = await import('../../../../config/socket.js');
        getIO()?.to(rooms.restaurant(restaurantId)).emit('new_dining_booking', booking);
    } catch (err) {
        console.warn('Dining booking socket emit failed:', err?.message || err);
    }
    try {
        const { notifyOwnerSafely } = await import('../../../../core/notifications/firebase.service.js');
        await notifyOwnerSafely(
            { ownerType: 'RESTAURANT', ownerId: restaurantId },
            { title, body, data: { type: 'new_dining_booking', bookingId: String(booking?.bookingId || ''), link: '/food/restaurant/reservations' } }
        );
    } catch (err) {
        console.warn('Dining booking push failed:', err?.message || err);
    }
    try {
        const { createInboxNotifications } = await import('../../../../core/notifications/notification.service.js');
        await createInboxNotifications({
            notifications: [{
                ownerType: 'RESTAURANT', ownerId: String(restaurantId), title, message: body,
                category: 'dining', source: 'ORDER_UPDATE', link: '/food/restaurant/reservations'
            }]
        });
    } catch (err) {
        console.warn('Dining booking inbox message failed:', err?.message || err);
    }
}

export async function listUserBookings(userId) {
    const docs = await FoodDiningBooking.find({ userId })
        .populate('restaurantId')
        .populate('userId')
        .sort({ date: -1, createdAt: -1 });

    return docs.map(formatBooking).filter(Boolean);
}

export async function listRestaurantBookings(restaurantIdentifier, authInfo = {}) {
    let restaurantId = restaurantIdentifier;

    // Resolve restaurant ID if a slug was passed
    if (!mongoose.Types.ObjectId.isValid(restaurantIdentifier)) {
        const rest = await FoodRestaurant.findOne({ slug: restaurantIdentifier }).select('_id').lean();
        if (!rest) return [];
        restaurantId = rest._id;
    }

    // Owner check: role is RESTAURANT and user ID matches restaurant ID
    const isAuthorizedOwner = authInfo.requesterRole === 'RESTAURANT' && 
        String(authInfo.requesterId) === String(restaurantId);

    const docs = await FoodDiningBooking.find({ restaurantId })
        .populate('restaurantId')
        .populate('userId')
        .sort({ date: -1, createdAt: -1 });

    const formatted = docs.map(formatBooking).filter(Boolean);

    // If request is public (availability check), redact user personal details to protect privacy
    if (!isAuthorizedOwner) {
        return formatted.map((b) => ({
            ...b,
            user: {
                _id: b.user?._id || null,
                id: b.user?.id || null,
                name: 'Guest',
                phone: '',
                email: ''
            },
            specialRequest: ''
        }));
    }

    return formatted;
}

export async function updateBookingStatus(bookingId, status, restaurantId) {
    const booking = await FoodDiningBooking.findById(bookingId);
    if (!booking) {
        throw new Error('Booking not found');
    }

    if (booking.restaurantId.toString() !== restaurantId.toString()) {
        throw new Error('Unauthorized status update for this restaurant');
    }

    booking.status = String(status || '').trim().toLowerCase();
    await booking.save();

    const populated = await FoodDiningBooking.findById(booking._id)
        .populate('restaurantId')
        .populate('userId');

    return formatBooking(populated);
}

export async function submitBookingReview(bookingId, userId, rating, comment) {
    const booking = await FoodDiningBooking.findById(bookingId);
    if (!booking) {
        throw new Error('Booking not found');
    }

    if (booking.userId.toString() !== userId.toString()) {
        throw new Error('Unauthorized feedback submission');
    }

    booking.review = {
        rating: Math.min(5, Math.max(1, Number(rating) || 5)),
        comment: String(comment || '').trim(),
        createdAt: new Date()
    };

    await booking.save();

    const populated = await FoodDiningBooking.findById(booking._id)
        .populate('restaurantId')
        .populate('userId');

    return formatBooking(populated);
}
