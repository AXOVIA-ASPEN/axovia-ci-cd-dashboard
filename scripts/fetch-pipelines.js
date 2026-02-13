#!/usr/bin/env node

/**
 * Fetch Pipeline Data Script
 * Fetches GitHub Actions workflow runs for all monitored projects
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load configuration
const configPath = path.join(__dirname, '..', 'js', 'config.js');
const configContent = fs.readFileSync(configPath, 'utf8');
// Extract CONFIG object from the file (simple parsing)
const configMatch = configContent.match(/const CONFIG = ({[\s\S]*?});/);
if (!configMatch) {
    console.error('❌ Failed to parse config.js');
    process.exit(1);
}

// Evaluate config (in production, use proper JSON)
const CONFIG = eval('(' + configMatch[1] + ')');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const API_BASE = 'https://api.github.com';

async function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'ASPEN-CI-Dashboard',
                'Accept': 'application/vnd.github.v3+json',
                ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function getWorkflowRuns(owner, repo) {
    const url = `${API_BASE}/repos/${owner}/${repo}/actions/runs?per_page=10`;
    try {
        const data = await fetchJSON(url);
        return data.workflow_runs || [];
    } catch (error) {
        console.error(`❌ Error fetching runs for ${owner}/${repo}:`, error.message);
        return [];
    }
}

function calculatePassRate(runs) {
    if (runs.length === 0) return 0;
    const passed = runs.filter(r => r.conclusion === 'success').length;
    return Math.round((passed / runs.length) * 100);
}

async function main() {
    console.log('🌲 Fetching pipeline data for all projects...');

    const pipelineData = [];
    let passing = 0, failing = 0, running = 0;

    for (const project of CONFIG.projects) {
        console.log(`  📊 Fetching ${project.name}...`);
        
        const runs = await getWorkflowRuns(project.owner, project.repo);
        
        if (runs.length === 0) {
            console.log(`    ⚠️  No workflow runs found`);
            pipelineData.push({
                ...project,
                status: 'pending',
                lastRun: new Date().toISOString(),
                buildNumber: 0,
                passRate: 0,
                runUrl: `https://github.com/${project.owner}/${project.repo}/actions`
            });
            continue;
        }

        const latestRun = runs[0];
        const status = latestRun.status === 'completed' 
            ? (latestRun.conclusion === 'success' ? 'success' : 'failure')
            : 'in_progress';

        const passRate = calculatePassRate(runs);

        pipelineData.push({
            ...project,
            status,
            lastRun: latestRun.updated_at,
            buildNumber: latestRun.run_number,
            passRate,
            runUrl: latestRun.html_url
        });

        // Update counters
        if (status === 'success') passing++;
        else if (status === 'failure') failing++;
        else if (status === 'in_progress') running++;

        console.log(`    ✅ Status: ${status}, Build: #${latestRun.run_number}`);
    }

    // Calculate overall pass rate
    const totalPassRate = Math.round(
        pipelineData.reduce((sum, p) => sum + p.passRate, 0) / pipelineData.length
    );

    const stats = {
        passing,
        failing,
        running,
        passRate: totalPassRate
    };

    const meta = {
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
    };

    // Write data files
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(
        path.join(dataDir, 'pipelines.json'),
        JSON.stringify(pipelineData, null, 2)
    );

    fs.writeFileSync(
        path.join(dataDir, 'stats.json'),
        JSON.stringify(stats, null, 2)
    );

    fs.writeFileSync(
        path.join(dataDir, 'meta.json'),
        JSON.stringify(meta, null, 2)
    );

    console.log('\n✅ Pipeline data updated successfully!');
    console.log(`   Passing: ${passing} | Failing: ${failing} | Running: ${running}`);
    console.log(`   Overall Pass Rate: ${totalPassRate}%`);
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
