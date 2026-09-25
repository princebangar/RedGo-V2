/**
 * Razorpay Payment Integration Utility
 * Handles Razorpay payment initialization and verification
 */

let razorpayLoaded = false;

/**
 * Load Razorpay checkout script
 */
export const loadRazorpayScript = () => {
  return new Promise((resolve, reject) => {
    if (razorpayLoaded) {
      resolve();
      return;
    }

    if (window.Razorpay) {
      razorpayLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      razorpayLoaded = true;
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load Razorpay script'));
    };
    document.body.appendChild(script);
  });
};

/**
 * Preload the Razorpay SDK in the background (call early, e.g. on cart mount)
 * so that when the user clicks "Place Order", the script is already ready.
 */
export const preloadRazorpayScript = () => {
  loadRazorpayScript().catch(() => {
    // Silently ignore — will retry when payment is initiated
  });
};

/**
 * Initialize Razorpay payment
 * @param {Object} options - Payment options
 * @param {String} options.key - Razorpay key ID
 * @param {String} options.amount - Amount in paise
 * @param {String} options.currency - Currency code
 * @param {String} options.order_id - Razorpay order ID
 * @param {String} options.name - Company/App name
 * @param {String} options.description - Payment description
 * @param {String} options.prefill.name - Customer name
 * @param {String} options.prefill.email - Customer email
 * @param {String} options.prefill.contact - Customer phone
 * @param {Object} options.notes - Additional notes
 * @param {Function} options.handler - Success callback
 * @param {Function} options.onError - Error callback
 * @param {Function} options.onClose - Close/cancel callback
 */
export const initRazorpayPayment = async (options) => {
  try {
    // Load Razorpay script if not already loaded
    await loadRazorpayScript();

    if (!window.Razorpay) {
      throw new Error('Razorpay SDK not available');
    }

    let paymentCompleted = false;
    let closeFired = false;

    // Fire the onClose callback exactly once
    const fireClose = () => {
      if (!paymentCompleted && !closeFired) {
        closeFired = true;
        if (options.onClose) {
          options.onClose();
        }
      }
    };

    // NOTE: we intentionally do NOT treat "app came back from the UPI app" as a cancel.
    // Razorpay needs a few seconds after the user returns to confirm the payment; closing
    // early hid the "Placing your order" screen, flashed the cart and showed a false
    // "payment not completed" message. Real cancels are reported by Razorpay itself via
    // modal.ondismiss and the payment.failed event below.

    const razorpayOptions = {
      key: options.key,
      amount: options.amount,
      currency: options.currency || 'INR',
      order_id: options.order_id,
      name: options.name || 'Appzeto Food',
      description: options.description || 'Order Payment',
      image: options.image || '/logo.png',
      prefill: {
        name: options.prefill?.name || '',
        email: options.prefill?.email || '',
        contact: options.prefill?.contact || ''
      },
      notes: options.notes || {},
      theme: {
        color: '#E23744'
      },
      handler: function(response) {
        paymentCompleted = true;
        closeFired = true; // Prevent onClose from also firing after success
        if (options.handler) {
          options.handler(response);
        }
      },
      modal: {
        ondismiss: function() {
          fireClose();
        },
        escape: true,
        animation: true,
        // Handle Android back button — dismiss modal instead of staying stuck
        handleback: true,
      },
      // Disable auto-retry — user should NOT need to cancel twice
      retry: {
        enabled: false,
      },
    };

    const razorpay = new window.Razorpay(razorpayOptions);

    // Handle payment failures
    razorpay.on('payment.failed', function(response) {
      console.error('Razorpay payment failed:', response);
      if (options.onError) {
        options.onError(response.error || { description: 'Payment failed. Please try again.' });
      }
    });

    // Open Razorpay modal
    razorpay.open();

    console.log('✅ Razorpay checkout opened successfully');

    return razorpay;
  } catch (error) {
    console.error('Error initializing Razorpay:', error);
    if (options.onError) {
      options.onError(error);
    }
    throw error;
  }
};

/**
 * Format amount for display
 * @param {Number} amount - Amount in paise
 * @returns {String} Formatted amount string
 */
export const formatAmount = (amount) => {
  return `₹${(amount / 100).toFixed(2)}`;
};
