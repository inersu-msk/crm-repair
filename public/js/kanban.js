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

        this.statuses.forEach(status => {
            const column = this.createColumn(status);
            this.container.appendChild(column);
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
        ${order.amount ? `<span class="order-card-amount">${this.formatMoney(order.amount)}</span>` : ''}
      </div>
    `;

        // Клик по карточке
        card.addEventListener('click', () => {
            this.onOrderClick(order);
        });

        // Drag start
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
}
