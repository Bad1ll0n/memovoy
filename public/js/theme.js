/* =====================================================
   THEME.JS — Insight Travel App
   Gere o toggle light/dark e persiste em localStorage
   ===================================================== */

(function () {
    'use strict';

    var STORAGE_KEY = 'insight-theme';
    var DEFAULT_THEME = 'light';

    /* ─── Aplica o tema ao <html> ─── */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        updateAllToggles(theme);
    }

    /* ─── Actualiza o estado visual de todos os botões toggle ─── */
    function updateAllToggles(theme) {
        var switches = document.querySelectorAll('.theme-switch');
        switches.forEach(function (sw) {
            sw.setAttribute('aria-checked', theme === 'light' ? 'true' : 'false');
            sw.setAttribute('title', theme === 'light' ? 'Mudar para modo escuro' : 'Mudar para modo claro');
        });

        /* Ícone do botão no dropdown (sol / lua) */
        var icons = document.querySelectorAll('.theme-toggle-icon');
        icons.forEach(function (icon) {
            icon.className = 'theme-toggle-icon fa-solid ' + (theme === 'light' ? 'fa-moon' : 'fa-sun');
        });

        /* Label de texto */
        var labels = document.querySelectorAll('.theme-toggle-label');
        labels.forEach(function (label) {
            label.textContent = theme === 'light' ? 'Escuro' : 'Claro';
        });
    }

    /* ─── Toggle entre dark e light ─── */
    function toggleTheme() {
        var current = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
        applyTheme(current === 'dark' ? 'light' : 'dark');
    }

    /* ─── Liga eventos a todos os .theme-switch ─── */
    function bindSwitches() {
        document.querySelectorAll('.theme-switch').forEach(function (sw) {
            sw.addEventListener('click', function (e) {
                e.stopPropagation();
                toggleTheme();
            });
        });
    }

    /* ─── Init ─── */
    var savedTheme = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    applyTheme(savedTheme);

    /* Aguarda DOM para ligar eventos e actualizar ícones */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            bindSwitches();
            updateAllToggles(savedTheme);
        });
    } else {
        bindSwitches();
        updateAllToggles(savedTheme);
    }

    /* Expõe função global para uso pontual */
    window.toggleTheme = toggleTheme;
})();
