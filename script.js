let orderId = 1;
let chefs = 2;
let cookingQueue = [];
let orderQueue = [];
let completedOrders = [];
let cancelledOrders = [];
let chefsArray = [];
let activeOrders = {};
let chefWorkers = {};
let useWorkers = true;

// ---------- Worker Message Handling ----------
function handleWorkerMessage(chefId, msg) {
  if (msg.type === "done") {
    const order = msg.order;
    cookingQueue = cookingQueue.filter(o => o.id !== order.id);
    order.status = "completed";
    completedOrders.push(order);

    const chef = chefsArray.find(c => c.id === chefId);
    if (chef) {
      chef.idle = true;
      chef.orderId = null;
    }
    render();
    processQueues();
  } else if (msg.type === "cancelled") {
    const order = msg.order;
    cookingQueue = cookingQueue.filter(o => o.id !== order.id);
    order.status = "cancelled";

    const chef = chefsArray.find(c => c.id === chefId);
    if (chef) {
      chef.idle = true;
      chef.orderId = null;
    }
    render();
    processQueues();
  }
}

// ---------- Add a new order ----------
function addOrder() {
  const input = document.getElementById("orderInput");
  const items = input.value.trim();
  if (!items) return;

  const order = {
    id: orderId++,
    items: items.split(",").map(i => i.trim()),
    status: "waiting",
    chef: null
  };

  orderQueue.push(order);
  input.value = "";
  render();
  processQueues();
}

// ---------- Cancel order ----------
function cancelOrder(id, from) {
  let order;

  if (from === "order") {
    order = orderQueue.find(o => o.id === id);
    orderQueue = orderQueue.filter(o => o.id !== id);
  } 
  else if (from === "cooking") {
    order = cookingQueue.find(o => o.id === id);
    cookingQueue = cookingQueue.filter(o => o.id !== id);

    // Kill worker/timeout if active
    if (useWorkers && order.chef && chefWorkers[order.chef]) {
      chefWorkers[order.chef].postMessage({ type: "cancel-current", orderId: id });
    } else if (activeOrders[id]) {
      clearTimeout(activeOrders[id]);
      delete activeOrders[id];
    }

  }

  if (order) {
    if (order.status !== "cancelled") {
      order.status = "cancelled";
      cancelledOrders.push(order);
    }

  // ✅ kill timeout if still running
    if (activeOrders[id]) {
      clearTimeout(activeOrders[id]);
      delete activeOrders[id];
    }

    if (order.chef) {
      const chef = chefsArray.find(c => c.id === order.chef);
      if (chef) {
        chef.idle = true;
        chef.orderId = null;
      }
    }

    render();
    processQueues();
  }

}

// ---------- Tear down workers ----------
function teardownWorkers() {
  Object.values(chefWorkers).forEach(w => w.terminate());
  chefWorkers = {};
}

// ---------- Set number of chefs ----------
function setChefs() {
  const inputEl = document.getElementById("chefInput");
  const val = parseInt(inputEl.value, 10);

  if (!Number.isFinite(val) || val < 1) {
    alert("⚠️ Number of chefs must be at least 1.");
    inputEl.value = chefs; 
    return;
  }

  if (val > 100) {
    const proceed = confirm(
      `You entered ${val} chefs. This may slow down your browser. Do you want to continue?`
    );
    if (!proceed) {
      inputEl.value = chefs;
      return;
    }
  }

  const newCount = val;

  if (cookingQueue.length) {
    cookingQueue.forEach(order => {
      order.status = "waiting";
      order.chef = null;
      orderQueue.unshift(order);
    });
    cookingQueue = [];
  }

  teardownWorkers();

  chefs = newCount;
  chefsArray = [];
  for (let i = 0; i < chefs; i++) {
    chefsArray.push({ id: i + 1, idle: true, orderId: null });
  }

  if (useWorkers) {
    chefsArray.forEach(chef => {
      try {
        const w = new Worker("worker-chef.js");
        w.onmessage = (e) => handleWorkerMessage(chef.id, e.data);
        chefWorkers[chef.id] = w;
      } catch (err) {
        console.warn("Worker failed; falling back to timers.", err);
        useWorkers = false;
      }
    });
  }

  inputEl.value = chefs; 
  render();
  processQueues();
}

// ---------- Process Queues ----------
function processQueues() {
  while (orderQueue.length > 0) {
    const chef = chefsArray.find(c => c.idle);
    if (!chef) break;

    const order = orderQueue.shift();
    order.status = "cooking";
    chef.idle = false;
    chef.orderId = order.id;
    order.chef = chef.id;
    cookingQueue.push(order);

    if (useWorkers && chefWorkers[chef.id]) {
      chefWorkers[chef.id].postMessage({ type: "cook", order });
    } else {
      const cookTime = order.items.length * 3000 + Math.floor(Math.random() * 2000);
      activeOrders[order.id] = setTimeout(() => {
  // double-check if cancelled before moving to completed
        const stillCooking = cookingQueue.find(o => o.id === order.id);
        if (!stillCooking || order.status === "cancelled") {
          delete activeOrders[order.id];
          return; // cancelled → do nothing
        }

  // ✅ Move to completed only if not cancelled
        cookingQueue = cookingQueue.filter(o => o.id !== order.id);
        order.status = "completed";
        completedOrders.push(order);

        if (chef) {
          chef.idle = true;
          chef.orderId = null;
        }

        delete activeOrders[order.id];
        render();
        processQueues();
      }, cookTime);
    }
  }
  render();
}

// ---------- Render UI ----------
function render() {
  const orderList = document.getElementById("orderList");
  orderList.innerHTML = "";
  orderQueue.forEach(order => {
    const li = document.createElement("li");
    li.textContent = `#${order.id}: ${order.items.join(", ")}`;
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = () => cancelOrder(order.id, "order");
    li.appendChild(cancelBtn);
    orderList.appendChild(li);
  });

  const cookingList = document.getElementById("cookingList");
  cookingList.innerHTML = "";
  chefsArray.forEach(chef => {
    if (chef.idle) {
      const li = document.createElement("li");
      li.classList.add("idle-chef");
      li.textContent = `Chef ${chef.id} - Idle`;
      cookingList.appendChild(li);
    } else {
      const order = cookingQueue.find(o => o.id === chef.orderId);
      if (order) {
        const li = document.createElement("li");
        li.textContent = `Chef ${chef.id} cooking #${order.id}: ${order.items.join(", ")}`;
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = () => cancelOrder(order.id, "cooking");
        li.appendChild(cancelBtn);
        cookingList.appendChild(li);
      }
    }
  });

  const completedList = document.getElementById("completedList");
  completedList.innerHTML = "";
  completedOrders.forEach(order => {
    const li = document.createElement("li");
    li.classList.add("completed");
    li.textContent = `Order #${order.id} completed: ${order.items.join(", ")}`;
    completedList.appendChild(li);
  });

  const cancelledList = document.getElementById("cancelledList");
  cancelledList.innerHTML = "";
  cancelledOrders.forEach(order => {
    const li = document.createElement("li");
    li.classList.add("cancelled");
    li.textContent = `Order #${order.id} cancelled: ${order.items.join(", ")}`;
    cancelledList.appendChild(li);
  });
}

// ---------- Settings Panel Toggle ----------
const settingsIcon = document.getElementById("settings-icon");
const settingsPanel = document.getElementById("settings-panel");

// Track state for rotation direction
let panelOpen = false;

settingsIcon.addEventListener("click", (e) => {
  e.stopPropagation();

  panelOpen = !panelOpen;
  settingsPanel.classList.toggle("active");

  // Reset old animation classes
  settingsIcon.classList.remove("rotate-forward", "rotate-backward");

  if (panelOpen) {
    // Opening → clockwise
    settingsIcon.classList.add("rotate-forward");
    setTimeout(() => settingsIcon.classList.remove("rotate-forward"), 600);
  } else {
    // Closing → counter-clockwise
    settingsIcon.classList.add("rotate-backward");
    setTimeout(() => settingsIcon.classList.remove("rotate-backward"), 600);
  }
});

// Close when clicking outside
document.addEventListener("click", (e) => {
  if (
    panelOpen &&
    !settingsPanel.contains(e.target) &&
    e.target !== settingsIcon
  ) {
    settingsPanel.classList.remove("active");
    panelOpen = false;

    settingsIcon.classList.remove("rotate-forward", "rotate-backward");
    settingsIcon.classList.add("rotate-backward");
    setTimeout(() => settingsIcon.classList.remove("rotate-backward"), 600);
  }
});

// Close with Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && panelOpen) {
    settingsPanel.classList.remove("active");
    panelOpen = false;

    settingsIcon.classList.remove("rotate-forward", "rotate-backward");
    settingsIcon.classList.add("rotate-backward");
    setTimeout(() => settingsIcon.classList.remove("rotate-backward"), 600);
  }
});

// Close panel if clicking outside
document.addEventListener("click", (e) => {
  if (
    settingsPanel.classList.contains("active") &&
    !settingsPanel.contains(e.target) &&
    e.target !== settingsIcon
  ) {
    settingsPanel.classList.remove("active");
  }
});

// Close panel with Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && settingsPanel.classList.contains("active")) {
    settingsPanel.classList.remove("active");
  }
});


// ---------- Theme Change ----------
document.getElementById("theme-select").addEventListener("change", (e) => {
  if (e.target.value === "light") {
    document.body.classList.add("light");
    document.body.classList.remove("dark");
  } else {
    document.body.classList.add("dark");
    document.body.classList.remove("light");
  }
});

// ---------- Font Size Change ----------
document.getElementById("font-size").addEventListener("input", (e) => {
  document.body.style.fontSize = e.target.value + "px";
});

// ---------- Font Type Change ----------
document.getElementById("font-select").addEventListener("change", (e) => {
  document.body.style.fontFamily = e.target.value;
});

// ---------- Textbox Width Change ----------
document.getElementById("textbox-width").addEventListener("input", (e) => {
  document.getElementById("orderInput").style.width = e.target.value + "px";
});

// ---------- Reset Textbox Size ----------
document.getElementById("reset-textbox").addEventListener("click", () => {
  const orderInput = document.getElementById("orderInput");
  orderInput.style.width = "360px";
  orderInput.style.height = "auto";
  document.getElementById("textbox-width").value = 360;
});

// ---------- Initialize ----------
setChefs();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js")
    .then(() => console.log("✅ Service Worker Registered"))
    .catch((err) => console.error("SW registration failed:", err));
}