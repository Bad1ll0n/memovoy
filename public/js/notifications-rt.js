/* notifications-rt.js — Notificações em tempo real via Socket.io */
(function () {
    if (typeof io === 'undefined') return;

    const socket = window._socket || io();
    window._socket = socket;

    /* ── Recebe nova notificação ── */
    socket.on('new_notification', function (data) {
        updateBadge(data.unread);
        showToast(data.type);
    });

    /* ── Recebe count de mensagens não lidas ── */
    socket.on('unread_messages', function (data) {
        updateMessagesBadge(data.count);
    });

    /* ── Atualiza o badge de mensagens ── */
    function updateMessagesBadge(count) {
        var links = document.querySelectorAll('a[href="/messages"]');
        links.forEach(function(link) {
            var badge = link.querySelector('.badge-custom');
            if (count > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'badge-custom';
                    link.appendChild(badge);
                }
                badge.textContent = count;
            } else {
                if (badge) badge.remove();
            }
        });
    }

    /* ── Atualiza o badge do sino na sidebar ── */
    function updateBadge(count) {
        // Procura o link de Notificações na sidebar
        const links = document.querySelectorAll('a[href="/notifications"]');
        links.forEach(function (link) {
            let badge = link.querySelector('.badge-custom');
            if (count > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'badge-custom';
                    link.appendChild(badge);
                }
                badge.textContent = count;
            } else {
                if (badge) badge.remove();
            }
        });

        // Atualiza também o sino da navbar (profile pages)
        const bell = document.querySelector('.pf-nav__bell');
        if (bell) {
            let dot = bell.querySelector('.notif-rt-dot');
            if (count > 0) {
                if (!dot) {
                    dot = document.createElement('span');
                    dot.className = 'notif-rt-dot';
                    dot.style.cssText = 'position:absolute;top:-2px;right:-2px;width:8px;height:8px;border-radius:50%;background:#f59e0b;border:2px solid var(--bg,#0d1117);';
                    bell.style.position = 'relative';
                    bell.appendChild(dot);
                }
            } else {
                if (dot) dot.remove();
            }
        }
    }

    /* ── Toast de notificação ── */
    function showToast(type) {
        const icons = {
            like:    '❤️',
            comment: '💬',
            follow:  '👤'
        };
        const labels = {
            like:    'alguém gostou do teu post',
            comment: 'alguém comentou no teu post',
            follow:  'alguém começou a seguir-te'
        };

        const toast = document.createElement('div');
        toast.style.cssText = [
            'position:fixed',
            'bottom:24px',
            'right:24px',
            'background:#1e2535',
            'border:1px solid #2a3145',
            'border-left:3px solid #f59e0b',
            'color:#e6edf3',
            'padding:12px 18px',
            'border-radius:10px',
            'font-size:.83rem',
            'font-family:Inter,Poppins,sans-serif',
            'z-index:9999',
            'display:flex',
            'align-items:center',
            'gap:10px',
            'box-shadow:0 4px 20px rgba(0,0,0,.4)',
            'cursor:pointer',
            'transition:opacity .3s',
            'max-width:300px'
        ].join(';');

        toast.innerHTML = '<span style="font-size:1.1rem">' + (icons[type] || '🔔') + '</span>' +
            '<span>' + (labels[type] || 'Nova notificação') + '</span>';

        toast.addEventListener('click', function () {
            window.location.href = '/notifications';
        });

        document.body.appendChild(toast);

        // Desaparece após 4 segundos
        setTimeout(function () {
            toast.style.opacity = '0';
            setTimeout(function () { toast.remove(); }, 300);
        }, 4000);
    }
})();