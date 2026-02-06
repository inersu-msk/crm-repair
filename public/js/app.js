// Main application
class App {
    constructor() {
        this.currentPage = 'orders';
        this.currentCityId = null;
        this.cities = [];
        this.statuses = [];
        this.sources = [];
        this.masters = [];
        this.kanban = null;
        this.statsPeriod = 'week';

        this.init();
    }

    async init() {
        // Проверяем авторизацию
        const token = api.getToken();

        if (!token) {
            await this.checkNeedRegistration();
            this.showAuthPage();
            return;
        }

        try {
            await api.getMe();
            this.showApp();
            await this.loadInitialData();
        } catch (error) {
            this.showAuthPage();
        }
    }

    async checkNeedRegistration() {
        try {
            const { needsRegistration } = await api.checkAuth();
            const authBtn = document.getElementById('auth-btn');
            if (needsRegistration) {
                authBtn.textContent = 'Зарегистрироваться';
                authBtn.dataset.mode = 'register';
            } else {
                authBtn.textContent = 'Войти';
                authBtn.dataset.mode = 'login';
            }
        } catch (error) {
            console.error('Check auth error:', error);
        }
    }

    showAuthPage() {
        document.getElementById('auth-page').classList.remove('hidden');
        document.getElementById('app').classList.add('hidden');
        this.setupAuthHandlers();
    }

    showApp() {
        document.getElementById('auth-page').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        this.setupAppHandlers();
    }

    setupAuthHandlers() {
        const form = document.getElementById('auth-form');
        const authBtn = document.getElementById('auth-btn');
        const errorEl = document.getElementById('auth-error');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            const mode = authBtn.dataset.mode || 'login';

            errorEl.classList.add('hidden');
            authBtn.disabled = true;
            authBtn.textContent = 'Загрузка...';

            try {
                if (mode === 'register') {
                    await api.register(username, password);
                } else {
                    await api.login(username, password);
                }

                this.showApp();
                await this.loadInitialData();
            } catch (error) {
                errorEl.textContent = error.message;
                errorEl.classList.remove('hidden');
                authBtn.disabled = false;
                authBtn.textContent = mode === 'register' ? 'Зарегистрироваться' : 'Войти';
            }
        });
    }

    setupAppHandlers() {
        // Навигация
        document.querySelectorAll('[data-page]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo(el.dataset.page);
            });
        });

        document.getElementById('btn-stats').addEventListener('click', () => {
            this.navigateTo('stats');
        });

        document.getElementById('btn-settings').addEventListener('click', () => {
            this.navigateTo('settings');
            this.renderSettingsUsers(); // Load users when opening settings
        });

        // Выход
        document.getElementById('btn-logout').addEventListener('click', () => {
            this.logout();
        });

        document.getElementById('btn-logout-settings').addEventListener('click', () => {
            this.logout();
        });

        // Добавить город
        document.getElementById('btn-add-city').addEventListener('click', () => {
            this.openCityModal();
        });

        // Добавить заказ
        document.getElementById('btn-add-order').addEventListener('click', () => {
            this.openOrderModal();
        });

        // Модальные окна
        this.setupModalHandlers();

        // Поиск
        this.setupSearchHandlers();

        // Настройки
        this.setupSettingsHandlers();

        // Статистика период
        document.querySelectorAll('#stats-period .period-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('#stats-period .period-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.statsPeriod = tab.dataset.period;
                this.loadStats();
            });
        });
    }

    setupModalHandlers() {
        // Модалка заказа
        const orderModal = document.getElementById('modal-order');
        const closeOrderModal = () => {
            orderModal.classList.remove('active');
        };

        document.getElementById('modal-order-close').addEventListener('click', closeOrderModal);
        document.getElementById('modal-order-cancel').addEventListener('click', closeOrderModal);
        orderModal.addEventListener('click', (e) => {
            if (e.target === orderModal) closeOrderModal();
        });

        document.getElementById('modal-order-save').addEventListener('click', () => {
            this.saveOrder();
        });

        document.getElementById('modal-order-delete').addEventListener('click', () => {
            this.deleteOrder();
        });

        // Кнопка копирования
        document.getElementById('modal-order-copy').addEventListener('click', () => {
            this.copyOrderToClipboard();
        });

        // Обработчик поля телефона - загрузка истории и валидация
        const phoneInput = document.getElementById('order-phone');
        const phoneError = document.getElementById('phone-error');
        let phoneDebounceTimer;

        phoneInput.addEventListener('input', (e) => {
            let value = phoneInput.value;

            // Если начали стирать - не мешаем
            if (e.inputType === 'deleteContentBackward') return;

            // Оставляем только цифры
            let digits = value.replace(/\D/g, '');

            // Если первая цифра 7 или 8, убираем её для нормализации
            if (digits.startsWith('7') || digits.startsWith('8')) {
                digits = digits.substring(1);
            }

            // Ограничиваем длину (10 цифр номера)
            digits = digits.substring(0, 10);

            // Формируем +7...
            let formatted = '+7';
            if (digits.length > 0) formatted += digits;

            phoneInput.value = formatted;

            // Сбрасываем ошибку при вводе
            phoneInput.classList.remove('error');
            phoneError.classList.add('hidden');

            // Debounced загрузка истории только если номер полный
            clearTimeout(phoneDebounceTimer);
            if (digits.length === 10) {
                phoneDebounceTimer = setTimeout(() => {
                    const orderId = document.getElementById('order-id').value;
                    this.loadPhoneHistory(formatted, orderId);
                }, 500);
            }
        });

        phoneInput.addEventListener('blur', () => {
            const phone = phoneInput.value.trim();
            // Разрешаем пустой (если необязательно) или проверяем полный формат
            if (phone && phone.length < 12) { // +7 + 10 цифр = 12 символов
                phoneInput.classList.add('error');
                phoneError.classList.remove('hidden');
            }
        });

        // Обработчик поля записи разговора - обновление плеера
        const recordingInput = document.getElementById('order-recording');
        const recordingPlayer = document.getElementById('recording-player');
        const recordingAudio = document.getElementById('recording-audio');

        recordingInput.addEventListener('input', () => {
            const url = recordingInput.value.trim();
            if (url) {
                recordingAudio.src = url;
                recordingPlayer.classList.remove('hidden');
            } else {
                recordingAudio.src = '';
                recordingPlayer.classList.add('hidden');
            }
        });

        // Модалка закрытия заказа
        const closeModal = document.getElementById('modal-close-order');
        const closeCloseModal = () => {
            closeModal.classList.remove('active');
        };

        document.getElementById('modal-close-order-close').addEventListener('click', closeCloseModal);
        document.getElementById('modal-close-order-cancel').addEventListener('click', closeCloseModal);
        closeModal.addEventListener('click', (e) => {
            if (e.target === closeModal) closeCloseModal();
        });

        document.getElementById('close-order-amount').addEventListener('input', (e) => {
            const amount = parseFloat(e.target.value) || 0;
            document.getElementById('close-order-my-share').textContent = this.formatMoney(amount / 2);
            document.getElementById('close-order-master-share').textContent = this.formatMoney(amount / 2);
        });

        document.getElementById('modal-close-order-confirm').addEventListener('click', () => {
            this.confirmCloseOrder();
        });

        // Модалка города
        const cityModal = document.getElementById('modal-city');
        const closeCityModal = () => {
            cityModal.classList.remove('active');
        };

        document.getElementById('modal-city-close').addEventListener('click', closeCityModal);
        document.getElementById('modal-city-cancel').addEventListener('click', closeCityModal);
        cityModal.addEventListener('click', (e) => {
            if (e.target === cityModal) closeCityModal();
        });

        document.getElementById('modal-city-save').addEventListener('click', () => {
            this.saveCity();
        });

        // Модалка назначения мастера
        const masterModal = document.getElementById('modal-master');
        const closeMasterModal = () => {
            masterModal.classList.remove('active');
        };

        document.getElementById('modal-master-close').addEventListener('click', closeMasterModal);
        document.getElementById('modal-master-cancel').addEventListener('click', closeMasterModal);
        masterModal.addEventListener('click', (e) => {
            if (e.target === masterModal) closeMasterModal();
        });

        document.getElementById('modal-master-confirm').addEventListener('click', () => {
            this.confirmAssignMaster();
        });

        // Автодополнение для мастера в модалке назначения
        const masterNickInput = document.getElementById('master-nick-input');
        const masterNickAutocomplete = document.getElementById('master-nick-autocomplete');

        masterNickInput.addEventListener('input', () => {
            const value = masterNickInput.value.toLowerCase();
            if (!value) {
                masterNickAutocomplete.classList.add('hidden');
                return;
            }

            const filtered = this.masters.filter(m =>
                m.telegram_nick.toLowerCase().includes(value)
            );

            if (filtered.length === 0) {
                masterNickAutocomplete.classList.add('hidden');
                return;
            }

            masterNickAutocomplete.innerHTML = filtered.map(m => `
        <div class="autocomplete-item" data-nick="${m.telegram_nick}">
          @${m.telegram_nick}
        </div>
      `).join('');
            masterNickAutocomplete.classList.remove('hidden');
        });

        masterNickAutocomplete.addEventListener('click', (e) => {
            const item = e.target.closest('.autocomplete-item');
            if (item) {
                masterNickInput.value = item.dataset.nick;
                masterNickAutocomplete.classList.add('hidden');
            }
        });

        masterNickInput.addEventListener('blur', () => {
            setTimeout(() => masterNickAutocomplete.classList.add('hidden'), 200);
        });

        // Автодополнение мастеров
        const masterInput = document.getElementById('order-master');
        const autocomplete = document.getElementById('master-autocomplete');

        masterInput.addEventListener('input', () => {
            const value = masterInput.value.toLowerCase();
            if (!value) {
                autocomplete.classList.add('hidden');
                return;
            }

            const filtered = this.masters.filter(m =>
                m.telegram_nick.toLowerCase().includes(value)
            );

            if (filtered.length === 0) {
                autocomplete.classList.add('hidden');
                return;
            }

            autocomplete.innerHTML = filtered.map(m => `
        <div class="autocomplete-item" data-nick="${m.telegram_nick}">
          @${m.telegram_nick}
        </div>
      `).join('');
            autocomplete.classList.remove('hidden');
        });

        autocomplete.addEventListener('click', (e) => {
            const item = e.target.closest('.autocomplete-item');
            if (item) {
                masterInput.value = item.dataset.nick;
                autocomplete.classList.add('hidden');
            }
        });

        masterInput.addEventListener('blur', () => {
            setTimeout(() => autocomplete.classList.add('hidden'), 200);
        });
    }

    setupSearchHandlers() {
        const searchInput = document.getElementById('search-input');
        const searchResults = document.getElementById('search-results');
        let debounceTimer;

        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const query = searchInput.value.trim();

            if (query.length < 2) {
                searchResults.classList.add('hidden');
                return;
            }

            debounceTimer = setTimeout(async () => {
                try {
                    const orders = await api.searchOrders(query);

                    if (orders.length === 0) {
                        searchResults.innerHTML = `
              <div class="search-result-item">
                <div class="search-result-address">Ничего не найдено</div>
              </div>
            `;
                    } else {
                        searchResults.innerHTML = orders.map(o => `
              <div class="search-result-item" data-order-id="${o.id}" data-city-id="${o.city_id}">
                <div class="search-result-address">${o.address || 'Без адреса'}</div>
                <div class="search-result-info">
                  <span>${o.city_name}</span>
                  <span>${o.status_name}</span>
                  ${o.client_name ? `<span>${o.client_name}</span>` : ''}
                </div>
              </div>
            `).join('');
                    }

                    searchResults.classList.remove('hidden');
                } catch (error) {
                    console.error('Search error:', error);
                }
            }, 300);
        });

        searchResults.addEventListener('click', async (e) => {
            const item = e.target.closest('.search-result-item');
            if (item && item.dataset.orderId) {
                const order = await api.getOrder(item.dataset.orderId);
                this.selectCity(parseInt(item.dataset.cityId));
                this.openOrderModal(order);
                searchResults.classList.add('hidden');
                searchInput.value = '';
            }
        });

        searchInput.addEventListener('blur', () => {
            setTimeout(() => searchResults.classList.add('hidden'), 200);
        });
    }

    setupSettingsHandlers() {
        // Добавить город из настроек
        document.getElementById('btn-save-city').addEventListener('click', async () => {
            const input = document.getElementById('new-city-name');
            const name = input.value.trim();

            if (!name) return;

            try {
                await api.createCity(name);
                input.value = '';
                await this.loadCities();
                this.renderSettingsCities();
                this.showToast('Город добавлен', 'success');
            } catch (error) {
                this.showToast(error.message, 'error');
            }
        });

        // Добавить источник
        document.getElementById('btn-save-source').addEventListener('click', async () => {
            const input = document.getElementById('new-source-name');
            const name = input.value.trim();

            if (!name) return;

            try {
                await api.createSource(name);
                input.value = '';
                await this.loadSources();
                this.renderSettingsSources();
                this.showToast('Источник добавлен', 'success');
            } catch (error) {
                this.showToast(error.message, 'error');
            }
        });

        // Пользователи (Админка)
        document.getElementById('btn-add-user').addEventListener('click', async () => {
            const loginInput = document.getElementById('new-user-login');
            const passInput = document.getElementById('new-user-pass');
            const username = loginInput.value.trim();
            const password = passInput.value;

            if (!username || !password) {
                this.showToast('Введите логин и пароль', 'error');
                return;
            }

            try {
                await api.createUser(username, password);
                loginInput.value = '';
                passInput.value = '';
                this.renderSettingsUsers();
                this.showToast('Пользователь создан', 'success');
            } catch (error) {
                this.showToast(error.message, 'error');
            }
        });

        // Смена пароля
        document.getElementById('btn-change-pass').addEventListener('click', async () => {
            const currentPassInput = document.getElementById('change-pass-current');
            const newPassInput = document.getElementById('change-pass-new');
            const currentPass = currentPassInput.value;
            const newPass = newPassInput.value;

            if (!currentPass || !newPass) {
                this.showToast('Заполните все поля', 'error');
                return;
            }

            try {
                await api.changePassword(currentPass, newPass);
                currentPassInput.value = '';
                newPassInput.value = '';
                this.showToast('Пароль успешно изменен', 'success');
            } catch (error) {
                this.showToast(error.message, 'error');
            }
        });
    }

    async loadInitialData() {
        try {
            // Загружаем параллельно
            const [cities, statuses, sources, masters] = await Promise.all([
                api.getCities(),
                api.getStatuses(),
                api.getSources(),
                api.getMasters()
            ]);

            this.cities = cities;
            this.statuses = statuses;
            this.sources = sources;
            this.masters = masters;

            this.renderCityTabs();
            this.renderSourcesSelect();

            // Выбираем первый город если есть
            if (cities.length > 0) {
                this.selectCity(cities[0].id);
            } else {
                this.renderEmptyState();
            }
        } catch (error) {
            console.error('Load initial data error:', error);
            this.showToast('Ошибка загрузки данных', 'error');
        }
    }

    async loadCities() {
        this.cities = await api.getCities();
        this.renderCityTabs();
    }

    async loadSources() {
        this.sources = await api.getSources();
        this.renderSourcesSelect();
    }

    async loadMasters() {
        this.masters = await api.getMasters();
    }

    renderCityTabs() {
        const container = document.getElementById('city-tabs');
        const addBtn = document.getElementById('btn-add-city');

        // Удаляем старые табы (кроме кнопки добавления)
        container.querySelectorAll('.city-tab:not(.city-tab-add)').forEach(el => el.remove());

        // Добавляем табы городов
        this.cities.forEach(city => {
            const tab = document.createElement('button');
            tab.className = 'city-tab';
            if (city.id === this.currentCityId) {
                tab.classList.add('active');
            }
            tab.dataset.cityId = city.id;
            tab.innerHTML = `
        ${city.name}
        ${city.new_count > 0 ? `<span class="badge">${city.new_count}</span>` : ''}
      `;
            tab.addEventListener('click', () => this.selectCity(city.id));
            container.insertBefore(tab, addBtn);
        });
    }

    renderSourcesSelect() {
        const select = document.getElementById('order-source');
        select.innerHTML = '<option value="">Не указано</option>' +
            this.sources.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

    renderSettingsCities() {
        const container = document.getElementById('settings-cities');
        container.innerHTML = this.cities.map(city => `
      <div class="chip">
        ${city.name}
        <button class="chip-delete" data-city-id="${city.id}" title="Удалить">×</button>
      </div>
    `).join('');

        container.querySelectorAll('.chip-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('Удалить город?')) {
                    try {
                        await api.deleteCity(btn.dataset.cityId);
                        await this.loadCities();
                        this.renderSettingsCities();
                        this.showToast('Город удалён', 'success');
                    } catch (error) {
                        this.showToast(error.message, 'error');
                    }
                }
            });
        });
    }

    renderSettingsSources() {
        const container = document.getElementById('settings-sources');
        container.innerHTML = this.sources.map(source => `
      <div class="chip">
        ${source.name}
        <button class="chip-delete" data-source-id="${source.id}" title="Удалить">×</button>
      </div>
    `).join('');

        container.querySelectorAll('.chip-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('Удалить источник?')) {
                    try {
                        await api.deleteSource(btn.dataset.sourceId);
                        await this.loadSources();
                        this.renderSettingsSources();
                        this.showToast('Источник удалён', 'success');
                    } catch (error) {
                        this.showToast(error.message, 'error');
                    }
                }
            });
        });
    }

    async renderSettingsUsers() {
        const container = document.getElementById('settings-users');
        if (!container) return;

        container.innerHTML = '<div class="loading-small">Загрузка...</div>';

        try {
            const users = await api.getUsers();

            if (users.length === 0) {
                container.innerHTML = '<div class="text-muted">Нет пользователей</div>';
                return;
            }

            container.innerHTML = users.map(user => `
                <div class="chip" style="justify-content: space-between; width: 100%;">
                    <span>${user.username} <span class="text-muted" style="font-size: 12px;">(ID: ${user.id})</span></span>
                    <button class="chip-delete" data-user-id="${user.id}" title="Удалить">×</button>
                </div>
            `).join('');

            container.querySelectorAll('.chip-delete').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (confirm('Удалить пользователя? Это действие нельзя отменить.')) {
                        try {
                            await api.deleteUser(btn.dataset.userId);
                            this.renderSettingsUsers();
                            this.showToast('Пользователь удален', 'success');
                        } catch (error) {
                            this.showToast(error.message, 'error');
                        }
                    }
                });
            });
        } catch (error) {
            console.error('Render users error:', error);
            container.innerHTML = '<div class="text-error">Ошибка загрузки</div>';
        }
    }

    renderEmptyState() {
        const kanbanEl = document.getElementById('kanban');
        kanbanEl.innerHTML = `
      <div class="empty-state" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        <h3>Добавьте первый город</h3>
        <p>Нажмите "Добавить город" чтобы начать</p>
      </div>
    `;
    }

    async selectCity(cityId) {
        this.currentCityId = cityId;

        // Обновляем табы
        document.querySelectorAll('.city-tab').forEach(tab => {
            tab.classList.toggle('active', parseInt(tab.dataset.cityId) === cityId);
        });

        // Загружаем заказы
        const kanbanEl = document.getElementById('kanban');
        kanbanEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

        try {
            const orders = await api.getOrdersByCity(cityId);

            this.kanban = new Kanban(kanbanEl, {
                onOrderClick: (order) => this.openOrderModal(order),
                onOrderMove: (orderId, statusId) => this.moveOrder(orderId, statusId),
                onOrderClose: (orderId) => this.openCloseOrderModal(orderId)
            });

            this.kanban.setStatuses(this.statuses);
            this.kanban.setOrders(orders);
        } catch (error) {
            console.error('Load orders error:', error);
            this.showToast('Ошибка загрузки заказов', 'error');
        }
    }

    async moveOrder(orderId, statusId) {
        try {
            const order = await api.updateOrderStatus(orderId, statusId);
            this.kanban.updateOrder(order);
            this.showToast('Статус обновлён', 'success');
            // Обновляем список мастеров
            this.loadMasters();
        } catch (error) {
            // Проверяем нужен ли мастер
            if (error.message && error.message.includes('мастера')) {
                this.openMasterModal(orderId, statusId);
            } else {
                this.showToast(error.message, 'error');
            }
        }
    }

    openMasterModal(orderId, statusId) {
        document.getElementById('master-order-id').value = orderId;
        document.getElementById('master-status-id').value = statusId;
        document.getElementById('master-nick-input').value = '';
        document.getElementById('modal-master').classList.add('active');
        document.getElementById('master-nick-input').focus();
    }

    async confirmAssignMaster() {
        const orderId = document.getElementById('master-order-id').value;
        const statusId = document.getElementById('master-status-id').value;
        const masterNick = document.getElementById('master-nick-input').value.trim();

        if (!masterNick) {
            this.showToast('Введите ник мастера', 'error');
            return;
        }

        try {
            const order = await api.updateOrderStatus(orderId, parseInt(statusId), masterNick);
            this.kanban.updateOrder(order);
            document.getElementById('modal-master').classList.remove('active');
            this.showToast('Мастер назначен, заказ в работе', 'success');
            // Обновляем список мастеров
            this.loadMasters();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    openCityModal() {
        document.getElementById('city-name').value = '';
        document.getElementById('modal-city').classList.add('active');
        document.getElementById('city-name').focus();
    }

    async saveCity() {
        const name = document.getElementById('city-name').value.trim();

        if (!name) {
            this.showToast('Введите название города', 'error');
            return;
        }

        try {
            const city = await api.createCity(name);
            this.cities.push(city);
            this.renderCityTabs();
            document.getElementById('modal-city').classList.remove('active');
            this.selectCity(city.id);
            this.showToast('Город добавлен', 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    openOrderModal(order = null) {
        if (!this.currentCityId && !order) {
            this.showToast('Сначала выберите город', 'error');
            return;
        }

        const modal = document.getElementById('modal-order');
        const title = document.getElementById('modal-order-title');
        const deleteBtn = document.getElementById('modal-order-delete');
        const phoneInput = document.getElementById('order-phone');
        const phoneError = document.getElementById('phone-error');
        const phoneHistory = document.getElementById('phone-history');
        const recordingInput = document.getElementById('order-recording');
        const recordingPlayer = document.getElementById('recording-player');
        const recordingAudio = document.getElementById('recording-audio');

        // Сбрасываем ошибки и историю
        phoneInput.classList.remove('error');
        phoneError.classList.add('hidden');
        phoneHistory.classList.add('hidden');
        recordingPlayer.classList.add('hidden');
        recordingAudio.src = '';

        if (order) {
            const orderNum = order.order_number ? ` #${order.order_number}` : '';
            title.textContent = `Заказ${orderNum}`;
            deleteBtn.classList.remove('hidden');

            document.getElementById('order-id').value = order.id;
            document.getElementById('order-address').value = order.address || '';
            document.getElementById('order-metro').value = order.metro || '';
            document.getElementById('order-problem').value = order.problem || '';
            document.getElementById('order-comment').value = order.comment || '';
            document.getElementById('order-source').value = order.source_id || '';
            document.getElementById('order-time').value = order.scheduled_time || '';
            phoneInput.value = order.phone || '';
            document.getElementById('order-client').value = order.client_name || '';
            document.getElementById('order-master').value = order.master_nick || '';
            recordingInput.value = order.recording_url || '';

            // Показываем плеер если есть запись
            if (order.recording_url) {
                recordingAudio.src = order.recording_url;
                recordingPlayer.classList.remove('hidden');
            }

            // Загружаем историю заказов если есть телефон
            if (order.phone) {
                this.loadPhoneHistory(order.phone, order.id);
            }
        } else {
            title.textContent = 'Новый заказ';
            deleteBtn.classList.add('hidden');

            document.getElementById('order-id').value = '';
            document.getElementById('order-form').reset();
        }

        modal.classList.add('active');
        document.getElementById('order-address').focus();
    }

    // Валидация телефона
    validatePhone(phone) {
        if (!phone) return true; // Пустой телефон разрешён
        const phoneRegex = /^\+7\d{10}$/;
        return phoneRegex.test(phone);
    }

    // Загрузка истории заказов по телефону
    async loadPhoneHistory(phone, excludeOrderId = null) {
        const phoneHistory = document.getElementById('phone-history');
        const phoneHistoryList = document.getElementById('phone-history-list');

        if (!phone || !this.validatePhone(phone)) {
            phoneHistory.classList.add('hidden');
            return;
        }

        try {
            const orders = await api.getOrdersByPhone(phone);
            // Исключаем текущий заказ
            const filteredOrders = excludeOrderId
                ? orders.filter(o => o.id != excludeOrderId)
                : orders;

            if (filteredOrders.length === 0) {
                phoneHistory.classList.add('hidden');
                return;
            }

            phoneHistoryList.innerHTML = filteredOrders.slice(0, 5).map(o => `
                <div class="phone-history-item" data-order-id="${o.id}" data-city-id="${o.city_id}">
                    <div class="phone-history-item-header">
                        <span class="phone-history-item-number">#${o.order_number || o.id}</span>
                        <span class="phone-history-item-date">${this.formatDate(o.created_at)}</span>
                    </div>
                    <div class="phone-history-item-address">${o.address || 'Без адреса'}</div>
                    <span class="phone-history-item-status" style="background: ${o.status_color}22; color: ${o.status_color}">
                        ${o.status_name}
                    </span>
                </div>
            `).join('');

            phoneHistory.classList.remove('hidden');

            // Обработчик клика по истории
            phoneHistoryList.querySelectorAll('.phone-history-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const order = await api.getOrder(item.dataset.orderId);
                    document.getElementById('modal-order').classList.remove('active');
                    setTimeout(() => this.openOrderModal(order), 100);
                });
            });
        } catch (error) {
            console.error('Load phone history error:', error);
        }
    }

    formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }

    async saveOrder() {
        const orderId = document.getElementById('order-id').value;
        const phoneInput = document.getElementById('order-phone');
        const phoneError = document.getElementById('phone-error');
        const phone = phoneInput.value.trim();

        // Валидация телефона
        if (phone && !this.validatePhone(phone)) {
            phoneInput.classList.add('error');
            phoneError.classList.remove('hidden');
            this.showToast('Телефон должен быть в формате +7XXXXXXXXXX', 'error');
            return;
        }

        if (phone && phone.length !== 12) {
            this.showToast('Номер телефона должен содержать 10 цифр после +7', 'error');
            return;
        }

        const data = {
            city_id: this.currentCityId,
            address: document.getElementById('order-address').value.trim(),
            metro: document.getElementById('order-metro').value.trim(),
            problem: document.getElementById('order-problem').value.trim(),
            comment: document.getElementById('order-comment').value.trim(),
            source_id: document.getElementById('order-source').value || null,
            scheduled_time: document.getElementById('order-time').value.trim(),
            phone: phone,
            client_name: document.getElementById('order-client').value.trim(),
            master_nick: document.getElementById('order-master').value.trim(),
            recording_url: document.getElementById('order-recording').value.trim()
        };

        try {
            let order;
            if (orderId) {
                order = await api.updateOrder(orderId, data);
                this.kanban.updateOrder(order);
                this.showToast('Заказ обновлён', 'success');
            } else {
                order = await api.createOrder(data);
                this.kanban.addOrder(order);
                this.showToast('Заказ создан', 'success');
            }

            document.getElementById('modal-order').classList.remove('active');

            // Обновляем список мастеров
            this.loadMasters();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    async deleteOrder() {
        const orderId = document.getElementById('order-id').value;

        if (!orderId || !confirm('Удалить заказ?')) return;

        try {
            await api.deleteOrder(orderId);
            this.kanban.removeOrder(parseInt(orderId));
            document.getElementById('modal-order').classList.remove('active');
            this.showToast('Заказ удалён', 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    async copyOrderToClipboard() {
        const orderId = document.getElementById('order-id').value;
        if (!orderId) {
            this.showToast('Сначала сохраните заказ', 'error');
            return;
        }

        try {
            const order = await api.getOrder(orderId);

            let text = '';
            if (order.order_number) {
                text += `Заказ #${order.order_number}\n`;
            }
            if (order.address) {
                text += `Адрес: ${order.address}\n`;
            }
            if (order.metro) {
                text += `Метро: ${order.metro}\n`;
            }
            if (order.problem) {
                text += `Проблема: ${order.problem}\n`;
            }
            if (order.phone) {
                text += `Телефон: ${order.phone}\n`;
            }
            if (order.client_name) {
                text += `Клиент: ${order.client_name}\n`;
            }
            if (order.scheduled_time) {
                text += `Время: ${order.scheduled_time}\n`;
            }
            if (order.master_nick) {
                text += `Мастер: @${order.master_nick}\n`;
            }
            if (order.source_name) {
                text += `Источник: ${order.source_name}\n`;
            }
            if (order.comment) {
                text += `Комментарий: ${order.comment}\n`;
            }

            await navigator.clipboard.writeText(text.trim());
            this.showToast('Скопировано в буфер обмена', 'success');
        } catch (error) {
            this.showToast('Ошибка копирования', 'error');
        }
    }

    openCloseOrderModal(orderId) {
        document.getElementById('close-order-id').value = orderId;
        document.getElementById('close-order-amount').value = '';
        document.getElementById('close-order-my-share').textContent = '0 ₽';
        document.getElementById('close-order-master-share').textContent = '0 ₽';
        document.getElementById('modal-close-order').classList.add('active');
        document.getElementById('close-order-amount').focus();
    }

    async confirmCloseOrder() {
        const orderId = document.getElementById('close-order-id').value;
        const amount = parseFloat(document.getElementById('close-order-amount').value) || 0;

        if (amount <= 0) {
            this.showToast('Укажите сумму заказа', 'error');
            return;
        }

        try {
            const order = await api.closeOrder(orderId, amount);
            this.kanban.updateOrder(order);
            document.getElementById('modal-close-order').classList.remove('active');
            this.showToast(`Заказ закрыт! Ваша доля: ${this.formatMoney(amount / 2)}`, 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    navigateTo(page) {
        this.currentPage = page;

        // Скрываем все страницы
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`page-${page}`).classList.add('active');

        // Обновляем нижнюю навигацию
        document.querySelectorAll('.bottom-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        // Показываем/скрываем FAB
        const fab = document.getElementById('btn-add-order');
        fab.style.display = page === 'orders' ? 'flex' : 'none';

        // Загружаем данные для страницы
        if (page === 'stats') {
            this.loadStats();
        } else if (page === 'settings') {
            this.renderSettingsCities();
            this.renderSettingsSources();
        }
    }

    async loadStats() {
        try {
            const [overview, masters, sources] = await Promise.all([
                api.getStatsOverview(),
                api.getStatsMasters(this.statsPeriod),
                api.getStatsSources(this.statsPeriod)
            ]);

            // Обзор
            const statsContainer = document.getElementById('stats-overview');
            const periodData = this.statsPeriod === 'day' ? overview.today :
                this.statsPeriod === 'week' ? overview.week :
                    this.statsPeriod === 'month' ? overview.month :
                        overview.allTime;

            statsContainer.innerHTML = `
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-title">Заработано</span>
            <div class="stat-card-icon">💰</div>
          </div>
          <div class="stat-card-value">${this.formatMoney(periodData.my_earnings)}</div>
          <div class="stat-card-label">Ваша доля (50%)</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-title">Общая сумма</span>
            <div class="stat-card-icon">📊</div>
          </div>
          <div class="stat-card-value">${this.formatMoney(periodData.total)}</div>
          <div class="stat-card-label">${periodData.orders} заказов</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-title">Активные заказы</span>
            <div class="stat-card-icon">📋</div>
          </div>
          <div class="stat-card-value">${overview.activeOrders}</div>
          <div class="stat-card-label">В работе сейчас</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-title">Средний чек</span>
            <div class="stat-card-icon">🧾</div>
          </div>
          <div class="stat-card-value">${this.formatMoney(overview.allTime.avg_check)}</div>
          <div class="stat-card-label">За всё время</div>
        </div>
      `;

            // Мастера
            const mastersContainer = document.getElementById('stats-masters');
            if (masters.length === 0) {
                mastersContainer.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Нет данных</td></tr>';
            } else {
                mastersContainer.innerHTML = masters.map(m => `
          <tr>
            <td><strong>@${m.telegram_nick}</strong></td>
            <td>${m.orders_count}</td>
            <td>${this.formatMoney(m.total_amount)}</td>
            <td style="color: var(--accent);">${this.formatMoney(m.total_earned)}</td>
            <td>${this.formatMoney(m.avg_check)}</td>
          </tr>
        `).join('');
            }

            // Источники
            const sourcesContainer = document.getElementById('stats-sources');
            if (sources.length === 0) {
                sourcesContainer.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Нет данных</td></tr>';
            } else {
                sourcesContainer.innerHTML = sources.map(s => `
          <tr>
            <td><strong>${s.name}</strong></td>
            <td>${s.orders_count}</td>
            <td>${this.formatMoney(s.total_amount)}</td>
            <td>${this.formatMoney(s.avg_check)}</td>
          </tr>
        `).join('');
            }
        } catch (error) {
            console.error('Load stats error:', error);
            this.showToast('Ошибка загрузки статистики', 'error');
        }
    }

    logout() {
        api.setToken(null);
        window.location.reload();
    }

    formatMoney(amount) {
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            maximumFractionDigits: 0
        }).format(amount || 0);
    }

    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
      <span>${type === 'success' ? '✓' : '✕'}</span>
      <span>${message}</span>
    `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
    new App();
});

// Регистрация Service Worker для PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('SW registered'))
            .catch(err => console.log('SW registration failed:', err));
    });
}
