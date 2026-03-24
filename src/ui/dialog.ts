// src/ui/dialog.ts

export function showAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    const overlay = createOverlay();
    const box = createBox();

    const msg = document.createElement("p");
    msg.className = "dialog__message";
    msg.textContent = message;

    const actions = document.createElement("div");
    actions.className = "dialog__actions";

    const okBtn = document.createElement("button");
    okBtn.className = "dialog__btn dialog__btn--primary";
    okBtn.textContent = "OK";
    okBtn.addEventListener("click", () => {
      cleanup(overlay);
      resolve();
    });

    actions.appendChild(okBtn);
    box.append(msg, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    okBtn.focus();

    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.stopPropagation();
        cleanup(overlay);
        resolve();
      }
    });
  });
}

export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = createOverlay();
    const box = createBox();

    const msg = document.createElement("p");
    msg.className = "dialog__message";
    msg.textContent = message;

    const actions = document.createElement("div");
    actions.className = "dialog__actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "dialog__btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      cleanup(overlay);
      resolve(false);
    });

    const okBtn = document.createElement("button");
    okBtn.className = "dialog__btn dialog__btn--primary";
    okBtn.textContent = "OK";
    okBtn.addEventListener("click", () => {
      cleanup(overlay);
      resolve(true);
    });

    actions.append(cancelBtn, okBtn);
    box.append(msg, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    okBtn.focus();

    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cleanup(overlay);
        resolve(false);
      }
      if (e.key === "Enter") {
        e.stopPropagation();
        cleanup(overlay);
        resolve(true);
      }
    });
  });
}

function createOverlay(): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";
  return overlay;
}

function createBox(): HTMLElement {
  const box = document.createElement("div");
  box.className = "dialog__box";
  return box;
}

function cleanup(overlay: HTMLElement): void {
  overlay.remove();
}
