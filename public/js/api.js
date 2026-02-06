// API клиент
const API_URL = '/api';

class Api {
    constructor() {
        this.token = localStorage.getItem('token');
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('token', token);
        } else {
            localStorage.removeItem('token');
        }
    }

    getToken() {
        return this.token;
    }

    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                ...options,
                headers,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Ошибка сервера');
            }

            return data;
        } catch (error) {
            if (error.message === 'Недействительный токен' || error.message === 'Требуется авторизация') {
                this.setToken(null);
                window.location.reload();
            }
            throw error;
        }
    }

    // Auth
    async checkAuth() {
        return this.request('/auth/check');
    }

    async login(username, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        this.setToken(data.token);
        return data;
    }

    async register(username, password) {
        const data = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        this.setToken(data.token);
        return data;
    }

    async getMe() {
        return this.request('/auth/me');
    }

    // Cities
    async getCities() {
        return this.request('/cities');
    }

    async createCity(name) {
        return this.request('/cities', {
            method: 'POST',
            body: JSON.stringify({ name }),
        });
    }

    async deleteCity(id) {
        return this.request(`/cities/${id}`, {
            method: 'DELETE',
        });
    }

    // Statuses
    async getStatuses() {
        return this.request('/statuses');
    }

    // Sources
    async getSources() {
        return this.request('/sources');
    }

    async createSource(name) {
        return this.request('/sources', {
            method: 'POST',
            body: JSON.stringify({ name }),
        });
    }

    async deleteSource(id) {
        return this.request(`/sources/${id}`, {
            method: 'DELETE',
        });
    }

    // Masters
    async getMasters() {
        return this.request('/masters');
    }

    // Orders
    async getOrdersByCity(cityId) {
        return this.request(`/orders/city/${cityId}`);
    }

    async getOrder(id) {
        return this.request(`/orders/${id}`);
    }

    async createOrder(data) {
        return this.request('/orders', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateOrder(id, data) {
        return this.request(`/orders/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async updateOrderStatus(id, statusId, masterNick = null) {
        const body = { status_id: statusId };
        if (masterNick) {
            body.master_nick = masterNick;
        }
        return this.request(`/orders/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
    }

    async closeOrder(id, amount) {
        return this.request(`/orders/${id}/close`, {
            method: 'PUT',
            body: JSON.stringify({ amount }),
        });
    }

    async deleteOrder(id) {
        return this.request(`/orders/${id}`, {
            method: 'DELETE',
        });
    }

    async searchOrders(query) {
        return this.request(`/orders/search?q=${encodeURIComponent(query)}`);
    }

    async getOrdersByPhone(phone) {
        return this.request(`/orders/by-phone/${encodeURIComponent(phone)}`);
    }

    // Stats
    async getStatsOverview() {
        return this.request('/stats/overview');
    }

    async getStatsMasters(period = 'all') {
        return this.request(`/stats/masters?period=${period}`);
    }

    async getStatsSources(period = 'all') {
        return this.request(`/stats/sources?period=${period}`);
    }

    // Пользователи
    async getUsers() {
        return this.request('/auth/users');
    }

    async createUser(username, password) {
        return this.request('/auth/users', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    }

    async deleteUser(id) {
        return this.request(`/auth/users/${id}`, {
            method: 'DELETE'
        });
    }

    async changePassword(currentPassword, newPassword) {
        return this.request('/auth/password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword })
        });
    }
}

const api = new Api();
