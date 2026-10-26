function optionButtons(root) {
  return [...root.querySelectorAll('[role="option"]')];
}

document.addEventListener("pointerdown", (event) => {
  document.querySelectorAll(".registration-dropdown.is-open").forEach((root) => {
    if (root.contains(event.target)) return;
    root.classList.remove("is-open", "opens-up");
    root.querySelector(".registration-dropdown-trigger")?.setAttribute("aria-expanded", "false");
  });
});

export function enhanceRegistrationSelect(select, { className = "" } = {}) {
  if (!select || select.closest(".registration-dropdown")) return select?.closest(".registration-dropdown");

  const label = select.getAttribute("aria-label") || select.labels?.[0]?.textContent.trim() || "Velg alternativ";
  const root = document.createElement("div");
  root.className = `registration-dropdown ${className}`.trim();
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "registration-dropdown-trigger";
  trigger.setAttribute("aria-label", label);
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const value = document.createElement("span");
  value.className = "registration-dropdown-value";
  const chevron = document.createElement("span");
  chevron.className = "registration-dropdown-chevron";
  chevron.setAttribute("aria-hidden", "true");
  trigger.append(value, chevron);
  const menu = document.createElement("div");
  menu.className = "registration-dropdown-menu";
  menu.setAttribute("role", "listbox");
  const listId = `registration-dropdown-${select.id || crypto.randomUUID()}`;
  menu.id = listId;
  menu.setAttribute("aria-label", label);
  trigger.setAttribute("aria-controls", listId);

  select.before(root);
  root.append(select, trigger, menu);
  select.classList.add("registration-native-select");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  let touched = false;

  function sync() {
    value.textContent = select.selectedOptions[0]?.textContent || "Velg alternativ";
    trigger.disabled = select.disabled;
    trigger.setAttribute("aria-invalid", touched && select.validity.valueMissing ? "true" : "false");
    optionButtons(root).forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.value === select.value));
    });
  }

  function close({ restoreFocus = false } = {}) {
    root.classList.remove("is-open", "opens-up");
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus && trigger.isConnected) trigger.focus();
  }

  function focusOption(index) {
    const buttons = optionButtons(root);
    if (buttons.length) buttons[(index + buttons.length) % buttons.length].focus();
  }

  function open(index) {
    if (trigger.disabled) return;
    const rect = root.getBoundingClientRect();
    const menuHeight = Math.min(280, optionButtons(root).length * 43 + 8);
    root.classList.toggle("opens-up", window.innerHeight - rect.bottom < menuHeight + 12 && rect.top > window.innerHeight - rect.bottom);
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => focusOption(index));
  }

  [...select.options].forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "registration-dropdown-option";
    button.setAttribute("role", "option");
    button.dataset.value = option.value;
    button.tabIndex = -1;
    button.disabled = option.disabled;
    const text = document.createElement("span");
    text.textContent = option.textContent;
    const check = document.createElement("span");
    check.textContent = "✓";
    check.setAttribute("aria-hidden", "true");
    check.className = "registration-dropdown-check";
    button.append(text, check);
    button.addEventListener("click", () => {
      touched = true;
      select.value = option.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      sync();
      close({ restoreFocus: true });
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        focusOption(index + (event.key === "ArrowDown" ? 1 : -1));
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        focusOption(event.key === "Home" ? 0 : select.options.length - 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        close({ restoreFocus: true });
      } else if (event.key === "Tab") {
        close();
      }
    });
    menu.appendChild(button);
  });

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (root.classList.contains("is-open")) close();
    else open(Math.max(0, select.selectedIndex));
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open(event.key === "ArrowDown" ? Math.max(0, select.selectedIndex) : Math.max(0, select.selectedIndex - 1));
    } else if (event.key === "Escape") {
      close();
    }
  });
  select.addEventListener("change", sync);
  select.addEventListener("invalid", (event) => {
    event.preventDefault();
    touched = true;
    sync();
    trigger.focus();
  });
  select.form?.addEventListener("reset", () => requestAnimationFrame(sync));
  sync();
  return root;
}

export function syncRegistrationSelect(select) {
  select?.dispatchEvent(new Event("change", { bubbles: false }));
}
