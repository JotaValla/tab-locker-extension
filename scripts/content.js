// content.js
const OVERLAY_ID = 'tab-locker-overlay';
const PASSWORD_INPUT_ID = 'tab-locker-password-input';
const SUBMIT_BUTTON_ID = 'tab-locker-submit-button';

let currentOverlayNode = null; // Mantendrá una referencia al nodo del overlay actual
let overlayMutationObserver = null;

function stopOverlayObserver() {
    if (overlayMutationObserver) {
        overlayMutationObserver.disconnect();
        overlayMutationObserver = null;
        console.log("CONTENT: MutationObserver detenido.");
    }
}

function startOverlayObserver() {
    stopOverlayObserver(); // Detener cualquier observer anterior

    if (!currentOverlayNode || !currentOverlayNode.parentNode) {
        // No hay overlay para observar o no está adjunto al DOM
        console.log("CONTENT: No se puede iniciar el observer, el overlay no existe o no tiene padre.");
        return;
    }

    overlayMutationObserver = new MutationObserver((mutationsList) => {
        let overlayWasRemoved = false;
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.removedNodes.forEach((node) => {
                    // Comprobar si el nodo eliminado ES el overlay que estábamos observando
                    if (node === currentOverlayNode) {
                        overlayWasRemoved = true;
                    }
                });
            }
        }

        if (overlayWasRemoved) {
            console.log("CONTENT: MutationObserver detectó la eliminación del overlay.");
            currentOverlayNode = null; // El nodo observado ya no está, limpiar referencia
            stopOverlayObserver();     // Detener este observer ya que su contexto cambió

            // Usar un pequeño timeout para permitir que el DOM se estabilice
            // y evitar posibles bucles si la eliminación desencadena otras cosas.
            setTimeout(() => {
                // Volver a verificar si realmente falta por ID, por si acaso
                if (!document.getElementById(OVERLAY_ID)) {
                    console.log("CONTENT: Recreando overlay después de la eliminación detectada...");
                    createOverlay(); // Esto creará un nuevo overlay y reiniciará el observer para él.
                }
            }, 0); // Ejecutar tan pronto como sea posible después del ciclo actual
        }
    });

    // Observar el nodo padre del overlay actual para cambios en sus hijos
    overlayMutationObserver.observe(currentOverlayNode.parentNode, { childList: true });
    console.log("CONTENT: MutationObserver iniciado para el overlay en:", currentOverlayNode.parentNode);
}

function createOverlay() {
    console.log("CONTENT: createOverlay() llamado.");

    // Si ya existe un overlay con el ID, no crear uno nuevo, pero asegurar que el observer esté activo.
    const existingOverlayById = document.getElementById(OVERLAY_ID);
    if (existingOverlayById) {
        console.log("CONTENT: Overlay ya existe (verificado por ID).");
        currentOverlayNode = existingOverlayById; // Actualizar nuestra referencia
        // Si el observer no está activo para este overlay (ej. script recargado), iniciarlo.
        if (!overlayMutationObserver && currentOverlayNode.parentNode) {
             console.log("CONTENT: Overlay existente encontrado, iniciando observer para él.");
             startOverlayObserver();
        }
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background-color: rgba(0, 0, 0, 0.8); backdrop-filter: blur(8px);
        z-index: 9999999; display: flex; flex-direction: column;
        justify-content: center; align-items: center;
        color: white; font-family: sans-serif;
    `;

    const message = document.createElement('h2');
    message.textContent = 'Esta pestaña está bloqueada.';
    overlay.appendChild(message);

    const passwordInput = document.createElement('input');
    passwordInput.id = PASSWORD_INPUT_ID;
    passwordInput.type = 'password';
    passwordInput.placeholder = 'Ingresa la contraseña';
    passwordInput.style.cssText = `
        padding: 10px; margin: 10px; border: none; border-radius: 5px;
        font-size: 1.2em; width: 300px; max-width: 80%;
        background-color: rgba(255, 255, 255, 0.9); color: #333;
    `;
    overlay.appendChild(passwordInput);

    const submitButton = document.createElement('button');
    submitButton.id = SUBMIT_BUTTON_ID;
    submitButton.textContent = 'Desbloquear';
    submitButton.style.cssText = `
        padding: 10px 20px; margin: 10px; background-color: #007bff;
        color: white; border: none; border-radius: 5px;
        cursor: pointer; font-size: 1.2em;
    `;
    overlay.appendChild(submitButton);

    if (!document.body) {
        console.error("CONTENT: document.body no está disponible para adjuntar el overlay.");
        currentOverlayNode = null; // Asegurar que esté nulo si no se puede adjuntar
        return;
    }
    document.body.appendChild(overlay);
    currentOverlayNode = overlay; // Guardar referencia al nodo del overlay creado

    submitButton.addEventListener('click', handlePasswordSubmit);
    passwordInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            console.log("CONTENT: Enter presionado.");
            handlePasswordSubmit();
        }
    });

    passwordInput.focus();
    startOverlayObserver(); // Iniciar el observer para el overlay recién creado
}

async function handlePasswordSubmit() {
    console.log("CONTENT: handlePasswordSubmit() llamado.");

    const passwordInput = document.getElementById(PASSWORD_INPUT_ID);
    const submitButton = document.getElementById(SUBMIT_BUTTON_ID);

    if (!passwordInput || !submitButton) {
        console.error("CONTENT: No se encontraron elementos del overlay en handlePasswordSubmit.");
        return;
    }

    const enteredPassword = passwordInput.value;

    if (!enteredPassword) {
        alert('Por favor, ingresa una contraseña.');
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Verificando...';

    try {
        console.log("CONTENT: Enviando checkPassword al background.");
        const response = await browser.runtime.sendMessage({
            action: 'checkPassword',
            password: enteredPassword
        });

        console.log("CONTENT: Respuesta de checkPassword del background:", response);

        if (response && response.isValid) {
            console.log("CONTENT: Contraseña correcta, removiendo overlay.");
            removeOverlay(); // Esto detendrá el observer
        } else {
            console.warn("CONTENT: Contraseña incorrecta o error en la verificación.");
            alert(response?.error || 'Contraseña incorrecta o error en la verificación. Inténtalo de nuevo.');
            passwordInput.value = '';
            passwordInput.focus();
        }
    } catch (error) {
        console.error("CONTENT: Error al verificar contraseña:", error);
        alert("Ocurrió un error al verificar la contraseña. Inténtalo de nuevo.");
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
        }
    } finally {
        // Rehabilitar botón si el overlay aún existe (no fue removido por contraseña correcta)
        // Esta verificación es importante porque si la contraseña fue correcta, el overlay ya no existe.
        if (document.getElementById(OVERLAY_ID) && submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Desbloquear';
        }
    }
}

function removeOverlay() {
    stopOverlayObserver(); // Es importante detener el observer antes de eliminar el nodo

    console.log("CONTENT: removeOverlay() llamado.");
    const overlay = document.getElementById(OVERLAY_ID); // Siempre obtener la referencia más reciente por ID
    if (overlay) {
        overlay.remove();
        console.log("CONTENT: Overlay removido del DOM.");
    } else {
        console.log("CONTENT: No se encontró overlay (por ID) para remover.");
    }
    currentOverlayNode = null; // Limpiar la referencia global
}

// Listener principal para mensajes del background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("CONTENT: Mensaje recibido del background:", message);

    if (message.action === 'lockTab') {
        createOverlay(); // createOverlay ahora maneja el inicio del observer
        sendResponse({ status: 'locked' });
    } else if (message.action === 'unlockTab') {
        removeOverlay(); // removeOverlay ahora maneja la detención del observer
        sendResponse({ status: 'unlocked' });
    } else {
        console.warn("CONTENT: Acción desconocida:", message.action);
        sendResponse({ status: 'unknown_action' });
    }
    return true; // Necesario para respuestas asíncronas
});