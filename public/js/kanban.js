// Kanban board functionality
class Kanban {
    constructor(container, options = {}) {
        this.container = container;
        this.statuses = [];
        this.orders = [];
        this.onOrderClick = options.onOrderClick || (() => { });
        this.onOrderMove = options.onOrderMove || (() => { });
        this.onOrderClose = options.onOrderClose || (() => { });
    }

    setStatuses(statuses) {
        this.statuses = statuses;
    }

    setOrders(orders) {
        this.orders = orders;
        this.render();
    }

    render() {
        this.container.innerHTML = '';
        this.renderMobileTabs();
        this.renderStatusSheetContainer();

        this.statuses.forEach((status, index) => {
            const column = this.createColumn(status);
            if (index === 0) column.classList.add('active'); // Default active for mobile
            this.container.appendChild(column);
        });
    }

    renderMobileTabs() {
        const tabsContainer = document.getElementById('mobile-kanban-tabs');
        if (!tabsContainer) return;

        tabsContainer.innerHTML = '';
        this.statuses.forEach((status, index) => {
            const tab = document.createElement('button');
            tab.className = `mobile-tab ${index === 0 ? 'active' : ''}`;
            tab.textContent = status.name;
            tab.onclick = () => {
                // Switch tabs
                tabsContainer.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Switch columns
                this.container.querySelectorAll('.kanban-column').forEach(c => {
                    c.classList.toggle('active', c.dataset.statusId == status.id);
                });
            };
            tabsContainer.appendChild(tab);
        });
    }

    createColumn(status) {
        const statusOrders = this.orders.filter(o => o.status_id === status.id);

        const column = document.createElement('div');
        column.className = 'kanban-column';
        column.dataset.statusId = status.id;

        column.innerHTML = `
      <div class="kanban-column-header">
        <div class="kanban-column-title">
          <span class="kanban-column-dot" style="background: ${status.color}"></span>
          ${status.name}
        </div>
        <span class="kanban-column-count">${statusOrders.length}</span>
      </div>
      <div class="kanban-column-body" data-status-id="${status.id}">
        ${statusOrders.length === 0 ? `
          <div class="empty-state" style="padding: 20px;">
            <p style="font-size: 13px;">Нет заказов</p>
          </div>
        ` : ''}
      </div>
    `;

        const body = column.querySelector('.kanban-column-body');

        // Добавляем карточки заказов
        statusOrders.forEach(order => {
            const card = this.createOrderCard(order);
            body.appendChild(card);
        });

        // Drag and drop для колонки
        body.addEventListener('dragover', (e) => {
            e.preventDefault();
            body.classList.add('drag-over');
        });

        body.addEventListener('dragleave', () => {
            body.classList.remove('drag-over');
        });

        body.addEventListener('drop', (e) => {
            e.preventDefault();
            body.classList.remove('drag-over');

            const orderId = e.dataTransfer.getData('text/plain');
            const newStatusId = parseInt(body.dataset.statusId);

            // Если перетащили в колонку "Завершён" - открываем модалку закрытия
            const completedStatus = this.statuses.find(s => s.name === 'Завершён');
            if (completedStatus && newStatusId === completedStatus.id) {
                this.onOrderClose(orderId);
            } else {
                this.onOrderMove(orderId, newStatusId);
            }
        });

        return column;
    }

    createOrderCard(order) {
        const card = document.createElement('div');
        card.className = 'order-card';
        card.draggable = true;
        card.dataset.orderId = order.id;

        const timeAgo = this.getTimeAgo(order.created_at);
        const currentStatus = this.statuses.find(s => s.id === order.status_id);

        card.innerHTML = `
      <div class="order-card-header">
        <div>
          ${order.order_number ? `<div class="order-card-number">#${order.order_number}</div>` : ''}
          <div class="order-card-address">${order.address || 'Без адреса'}</div>
          ${order.metro ? `<div class="order-card-metro">м. ${order.metro}</div>` : ''}
        </div>
        <div class="order-card-time">${order.scheduled_time || timeAgo}</div>
      </div>
      ${order.problem ? `<div class="order-card-problem">${order.problem}</div>` : ''}
      <div class="order-card-footer">
        <div style="display: flex; gap: 8px; align-items: center;">
          ${order.source_name ? `<span class="order-card-source">${order.source_name}</span>` : ''}
          ${order.master_nick ? `<span class="order-card-master">@${order.master_nick}</span>` : ''}
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          ${order.amount ? `<span class="order-card-amount">${this.formatMoney(order.amount)}</span>` : ''}
          <button class="status-change-btn" title="Изменить статус">
            <span class="status-dot" style="background: ${currentStatus?.color || '#666'}"></span>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      </div>
    `;

        // Кнопка смены статуса
        const statusBtn = card.querySelector('.status-change-btn');
        statusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openStatusSheet(order);
        });

        // Клик по карточке (открытие детального просмотра)
        card.addEventListener('click', (e) => {
            if (e.target.closest('.status-change-btn')) return;
            this.onOrderClick(order);
        });

        // Drag start (для десктопа)
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', order.id);
            e.dataTransfer.effectAllowed = 'move';
        });

        // Drag end
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        return card;
    }

    getTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'только что';
        if (minutes < 60) return `${minutes} мин`;
        if (hours < 24) return `${hours} ч`;
        if (days < 7) return `${days} дн`;

        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }

    formatMoney(amount) {
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            maximumFractionDigits: 0
        }).format(amount);
    }

    updateOrder(order) {
        const index = this.orders.findIndex(o => o.id === order.id);
        if (index !== -1) {
            this.orders[index] = order;
        }
        this.render();
    }

    addOrder(order) {
        this.orders.unshift(order);
        this.render();
    }

    removeOrder(orderId) {
        this.orders = this.orders.filter(o => o.id !== orderId);
        this.render();
    }

    renderStatusSheetContainer() {
        if (document.getElementById('status-sheet-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'status-sheet-overlay';
        overlay.className = 'status-sheet-overlay';

        overlay.innerHTML = `
            <div class="status-sheet">
                <div class="status-sheet-header">
                    <div class="status-sheet-title">Изменить статус</div>
                    <button class="status-sheet-close">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div class="status-sheet-options" id="status-sheet-options"></div>
            </div>
        `;

        document.body.appendChild(overlay);

        const closeBtn = overlay.querySelector('.status-sheet-close');

        const closeSheet = () => {
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.style.visibility = 'hidden';
            }, 300);
        };

        closeBtn.onclick = closeSheet;
        overlay.onclick = (e) => {
            if (e.target === overlay) closeSheet();
        };

        this.statusSheet = { overlay, optionsContainer: overlay.querySelector('#status-sheet-options'), close: closeSheet };
    }

    openStatusSheet(order) {
        if (!this.statusSheet) this.renderStatusSheetContainer();

        const { overlay, optionsContainer } = this.statusSheet;

        optionsContainer.innerHTML = this.statuses.map(s => `
            <div class="status-sheet-option ${s.id === order.status_id ? 'active' : ''}" data-status-id="${s.id}">
                <span class="status-dot" style="background: ${s.color}"></span>
                ${s.name}
                ${s.id === order.status_id ? '<svg style="margin-left: auto; color: var(--accent);" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
            </div>
        `).join('');

        optionsContainer.querySelectorAll('.status-sheet-option').forEach(option => {
            option.addEventListener('click', () => {
                const newStatusId = parseInt(option.dataset.statusId);
                this.statusSheet.close();

                if (newStatusId === order.status_id) return;

                const completedStatus = this.statuses.find(s => s.name === 'Завершён');
                if (completedStatus && newStatusId === completedStatus.id) {
                    this.onOrderClose(order.id);
                } else {
                    this.onOrderMove(order.id, newStatusId);
                }
            });
        });

        overlay.style.visibility = 'visible';
        overlay.offsetHeight;
        overlay.classList.add('active');
    }
}
