// options/options.js

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveButton').addEventListener('click', saveOptions);

/**
 * Calcula el hash SHA-256 de una cadena.
 * @param {string} str La cadena a hashear.
 * @returns {Promise<string>} El hash SHA-256 como una cadena hexadecimal.
 */
async function sha256(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

async function saveOptions() {
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const status = document.getElementById('status');

    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (password === '' || confirmPassword === '') {
        status.textContent = 'Por favor, ingresa y confirma la contraseña.';
        status.style.color = 'red';
        return;
    }
    if (password !== confirmPassword) {
        status.textContent = 'Las contraseñas no coinciden.';
        status.style.color = 'red';
        return;
    }

    const passwordToHash = password.trim();

    try {
        const hashedPassword = await sha256(passwordToHash);
        await browser.storage.local.set({ storedPasswordHash: hashedPassword });

        status.textContent = 'Contraseña guardada correctamente (hasheada).';
        status.style.color = 'green';
        passwordInput.value = '';
        confirmPasswordInput.value = '';
        console.log("OPTIONS: Hash de contraseña guardado.");

    } catch (error) {
        status.textContent = 'Error al guardar la contraseña: ' + error;
        status.style.color = 'red';
        console.error("OPTIONS: Error al hashear o guardar la contraseña:", error);
    }
}

function restoreOptions() {
    browser.storage.local.get('storedPasswordHash')
        .then(result => {
            const status = document.getElementById('status');
            if (result.storedPasswordHash) {
                console.log("OPTIONS: Hash de contraseña existente detectado.");
                status.textContent = 'Contraseña ya configurada. Puedes cambiarla si lo deseas.';
                status.style.color = 'blue';
            } else {
                console.log("OPTIONS: No hay hash de contraseña configurado aún.");
                status.textContent = 'Por favor, establece una contraseña.';
                status.style.color = 'orange';
            }
        })
        .catch(error => {
            console.error("OPTIONS: Error al restaurar opciones:", error);
            const status = document.getElementById('status');
            status.textContent = 'Error al cargar la configuración de contraseña.';
            status.style.color = 'red';
        });
}