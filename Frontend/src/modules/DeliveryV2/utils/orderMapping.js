export const getOrderLocation = (ref, keysLat, keysLng) => {
  if (!ref) return null;
  if (ref.location) {
    if (Array.isArray(ref.location.coordinates) && ref.location.coordinates.length >= 2) {
      return {
        lat: ref.location.coordinates[1],
        lng: ref.location.coordinates[0],
      };
    }
    return {
      lat: ref.location.latitude || ref.location.lat,
      lng: ref.location.longitude || ref.location.lng,
    };
  }
  for (const k of keysLat) {
    if (ref[k] != null) {
      return { lat: ref[k], lng: ref[keysLng[keysLat.indexOf(k)]] };
    }
  }
  return null;
};

export const mapOrderLocations = (serverData) => {
  if (!serverData) return null;
  const resLoc =
    getOrderLocation(serverData.restaurantId, ['latitude', 'lat'], ['longitude', 'lng']) ||
    getOrderLocation(
      serverData,
      ['restaurant_lat', 'restaurantLat', 'latitude'],
      ['restaurant_lng', 'restaurantLng', 'longitude'],
    );
  const cusLoc =
    getOrderLocation(serverData.deliveryAddress, ['latitude', 'lat'], ['longitude', 'lng']) ||
    getOrderLocation(
      serverData,
      ['customer_lat', 'customerLat', 'latitude'],
      ['customer_lng', 'customerLng', 'longitude'],
    );

  return {
    ...serverData,
    _id: serverData._id,
    orderId: serverData.orderId || serverData.order_id || serverData._id,
    restaurantLocation: resLoc,
    customerLocation: cusLoc,
  };
};
