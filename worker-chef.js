let currentOrder = null;
let currentTimer = null;

self.onmessage = (e) => {
  const msg = e.data;

  // Start cooking
  if (msg.type === "cook") {
    currentOrder = msg.order;
    const cookTime =
      currentOrder.items.length * 3000 + Math.floor(Math.random() * 2000);

    currentTimer = setTimeout(() => {
      const order = currentOrder;
      currentOrder = null;
      currentTimer = null;
      // Send back completion
      self.postMessage({ type: "done", order });
    }, cookTime);
  }

  // Cancel current order
  else if (msg.type === "cancel-current") {
    if (currentOrder && currentOrder.id === msg.orderId) {
      if (currentTimer) clearTimeout(currentTimer);
      const order = currentOrder;
      currentOrder = null;
      currentTimer = null;
      // Send back cancellation
      self.postMessage({ type: "cancelled", order });
    }
  }
};