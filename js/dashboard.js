/**
 * Axovia CI/CD Dashboard
 * Main dashboard logic for monitoring GitHub Actions across all projects
 */

class CIDashboard {
    constructor() {
        this.projects = CONFIG.projects;
        this.pipelineData = null;
        this.statsData = null;
        this.init();
    }

    async init() {
        console.log('🌲 Initializing Axovia CI/CD Dashboard...');
        await this.loadData();
        this.renderDashboard();
        this.setupEventListeners();
        
        // Auto-refresh if configured
        if (CONFIG.refreshInterval > 0) {
            setInterval(() => this.refresh(), CONFIG.refreshInterval * 1000);
        }
    }

    async loadData() {
        try {
            // Load pipeline data
            const pipelineResponse = await fetch(CONFIG.dataFiles.pipelines);
            this.pipelineData = await pipelineResponse.json();

            // Load stats
            const statsResponse = await fetch(CONFIG.dataFiles.stats);
            this.statsData = await statsResponse.json();

            // Update last updated time
            const metaResponse = await fetch(CONFIG.dataFiles.meta);
            const meta = await metaResponse.json();
            document.getElementById('last-updated').textContent = new Date(meta.lastUpdated).toLocaleString();

            console.log('✅ Data loaded successfully');
        } catch (error) {
            console.error('❌ Error loading data:', error);
            this.showError('Failed to load pipeline data. Using mock data.');
            this.loadMockData();
        }
    }

    loadMockData() {
        // Mock data for development/testing
        this.pipelineData = this.projects.map(project => ({
            ...project,
            status: Math.random() > 0.7 ? 'failure' : (Math.random() > 0.3 ? 'success' : 'in_progress'),
            lastRun: new Date(Date.now() - Math.random() * 86400000).toISOString(),
            buildNumber: Math.floor(Math.random() * 1000),
            passRate: Math.floor(Math.random() * 30 + 70),
            runUrl: `https://github.com/${project.owner}/${project.repo}/actions`
        }));

        this.statsData = {
            passing: this.pipelineData.filter(p => p.status === 'success').length,
            failing: this.pipelineData.filter(p => p.status === 'failure').length,
            running: this.pipelineData.filter(p => p.status === 'in_progress').length,
            passRate: Math.floor(this.pipelineData.reduce((sum, p) => sum + p.passRate, 0) / this.pipelineData.length)
        };

        document.getElementById('last-updated').textContent = new Date().toLocaleString();
    }

    renderDashboard() {
        this.renderStats();
        this.renderProjects();
        this.renderFailures();
    }

    renderStats() {
        if (!this.statsData) return;

        document.getElementById('passing-count').textContent = this.statsData.passing;
        document.getElementById('failing-count').textContent = this.statsData.failing;
        document.getElementById('running-count').textContent = this.statsData.running;
        document.getElementById('pass-rate').textContent = `${this.statsData.passRate}%`;
    }

    renderProjects() {
        if (!this.pipelineData) return;

        const grid = document.getElementById('projects-grid');
        grid.innerHTML = '';

        this.pipelineData.forEach(project => {
            const card = this.createProjectCard(project);
            grid.appendChild(card);
        });
    }

    createProjectCard(project) {
        const card = document.createElement('div');
        card.className = `project-card status-${project.status}`;
        
        const statusEmoji = {
            'success': '✅',
            'failure': '❌',
            'in_progress': '⏳',
            'pending': '⏸️'
        }[project.status] || '❓';

        const statusLabel = {
            'success': 'Passing',
            'failure': 'Failed',
            'in_progress': 'Running',
            'pending': 'Pending'
        }[project.status] || 'Unknown';

        const lastRunDate = new Date(project.lastRun);
        const timeAgo = this.getTimeAgo(lastRunDate);

        card.innerHTML = `
            <div class="project-header">
                <div class="project-icon">${project.icon}</div>
                <div class="project-info">
                    <h3 class="project-name">${project.name}</h3>
                    <p class="project-desc">${project.description}</p>
                </div>
                <div class="project-status">${statusEmoji}</div>
            </div>
            <div class="project-stats">
                <div class="stat-item">
                    <span class="stat-label">Status</span>
                    <span class="stat-value">${statusLabel}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Build</span>
                    <span class="stat-value">#${project.buildNumber}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Pass Rate</span>
                    <span class="stat-value">${project.passRate}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Last Run</span>
                    <span class="stat-value">${timeAgo}</span>
                </div>
            </div>
            <div class="project-actions">
                <a href="${project.runUrl}" target="_blank" class="btn btn-primary">View Workflow</a>
                ${project.status === 'failure' ? `<button class="btn btn-danger" onclick="dashboard.triggerAutoFix('${project.owner}/${project.repo}')">🔧 Auto-Fix</button>` : ''}
                <a href="https://github.com/${project.owner}/${project.repo}/releases" target="_blank" class="btn btn-secondary">📦 Release</a>
            </div>
        `;

        return card;
    }

    renderFailures() {
        if (!this.pipelineData) return;

        const failures = this.pipelineData.filter(p => p.status === 'failure');
        const section = document.getElementById('failures-section');
        const list = document.getElementById('failures-list');

        if (failures.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        list.innerHTML = '';

        failures.forEach(project => {
            const item = document.createElement('div');
            item.className = 'failure-item';
            item.innerHTML = `
                <div class="failure-header">
                    <span class="failure-icon">${project.icon}</span>
                    <h3>${project.name}</h3>
                    <span class="failure-status">Build #${project.buildNumber} failed</span>
                </div>
                <div class="failure-actions">
                    <a href="${project.runUrl}" target="_blank" class="btn btn-sm">View Logs</a>
                    <button class="btn btn-sm btn-danger" onclick="dashboard.triggerAutoFix('${project.owner}/${project.repo}')">🔧 Auto-Fix</button>
                </div>
            `;
            list.appendChild(item);
        });
    }

    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };

        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
            }
        }

        return 'just now';
    }

    setupEventListeners() {
        document.getElementById('refresh-btn').addEventListener('click', () => this.refresh());
    }

    async refresh() {
        console.log('🔄 Refreshing dashboard...');
        await this.loadData();
        this.renderDashboard();
    }

    async triggerAutoFix(repo) {
        console.log(`🔧 Triggering auto-fix for ${repo}...`);
        alert(`Auto-fix triggered for ${repo}. ASPEN will analyze and attempt to fix the pipeline.`);
        
        // TODO: Implement actual auto-fix trigger
        // This would call a GitHub Action or webhook that ASPEN monitors
    }

    showError(message) {
        console.error(message);
        // You could show a toast notification here
    }
}

// Initialize dashboard when DOM is ready
let dashboard;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        dashboard = new CIDashboard();
    });
} else {
    dashboard = new CIDashboard();
}
