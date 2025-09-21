document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    const appState = {
        data: [],
        headers: [],
        chartInstances: new Map()
    };

    // --- DOM ELEMENTS ---
    const fileInput = document.getElementById('file-input');
    const addChartBtn = document.getElementById('add-chart-btn');
    const chartGrid = document.getElementById('chart-grid');
    const emptyState = document.getElementById('empty-state');
    const mainContent = document.getElementById('main-content');
    const loader = document.getElementById('loader');
    const themeToggle = document.getElementById('theme-toggle');

    // --- CHART CONFIGURATION ---
    const CHART_TYPES = {
        'bar': 'Vertical Bar',
        'horizontalBar': 'Horizontal Bar',
        'groupedBar': 'Grouped Vertical Bar',
        'horizontalGroupedBar': 'Grouped Horizontal Bar',
        'stackedBar': 'Stacked Vertical Bar',
        'horizontalStackedBar': 'Stacked Horizontal Bar',
        'percentageStackedBar': '100% Stacked Vertical Bar',
        'horizontalPercentageStackedBar': '100% Stacked Horizontal Bar',
        'barWithLine': 'Bar with Line (Mixed)',
        'sortedBarAsc': 'Sorted Bar (Ascending)',
        'sortedBarDesc': 'Sorted Bar (Descending)',
        'barWithNegative': 'Bar with Negative Values',
        'floatingBar': 'Floating Bar (Range)',
        'roundedBar': 'Rounded Bar Chart',
        'customColorBar': 'Bar with Custom Colors',
        'dashedBorderBar': 'Bar with Dashed Border',
        'logarithmicBar': 'Logarithmic Y-Axis Bar',
        'tornado': 'Tornado Chart',
        'waterfall': 'Waterfall Chart'
    };

    // Predefined color palettes
    const COLOR_PALETTES = {
        default: ['#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#6b7280'],
        vibrant: ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'],
    };
    let currentPalette = COLOR_PALETTES.default;

    // Register Chart.js plugins
    Chart.register(ChartDataLabels);

    // --- EVENT LISTENERS ---
    fileInput.addEventListener('change', handleFileUpload);
    addChartBtn.addEventListener('click', addChartCard);
    chartGrid.addEventListener('change', handleChartControlChange);
    chartGrid.addEventListener('click', handleChartCardClick);
    themeToggle.addEventListener('change', toggleTheme);

    // --- THEME ---
    function setInitialTheme() {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (localStorage.getItem('theme') === 'dark' || (localStorage.getItem('theme') === null && prefersDark)) {
            document.body.classList.add('dark-mode');
            document.body.classList.remove('light-mode');
            themeToggle.checked = true;
        } else {
            document.body.classList.add('light-mode');
            document.body.classList.remove('dark-mode');
        }
    }

    function toggleTheme() {
        if (themeToggle.checked) {
            document.body.classList.add('dark-mode');
            document.body.classList.remove('light-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.add('light-mode');
            document.body.classList.remove('dark-mode');
            localStorage.setItem('theme', 'light');
        }
        // Redraw all charts to adapt to new theme
        appState.chartInstances.forEach(chart => {
            updateChartOptions(chart);
            chart.update();
        });
    }

    // --- FILE HANDLING ---
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        showLoader(true);
        const reader = new FileReader();

        reader.onload = e => {
            const data = e.target.result;
            const fileExtension = file.name.split('.').pop().toLowerCase();

            if (fileExtension === 'csv') {
                parseCSV(data);
            } else if (['xlsx', 'xls'].includes(fileExtension)) {
                parseExcel(data);
            } else {
                showNotification('Unsupported file format. Please upload a CSV or Excel file.');
                showLoader(false);
            }
        };

        reader.onerror = () => {
            showNotification('Error reading file.');
            showLoader(false);
        };

        if (['xlsx', 'xls'].includes(file.name.split('.').pop().toLowerCase())) {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    }

    function parseCSV(csvData) {
        Papa.parse(csvData, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            complete: (results) => processParsedData(results.data),
            error: () => {
                    showNotification('Error parsing CSV file.');
                showLoader(false);
            }
        });
    }

    function parseExcel(excelData) {
        try {
            const workbook = XLSX.read(excelData, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
            processParsedData(jsonData);
        } catch (error) {
                showNotification('Error parsing Excel file.');
            showLoader(false);
        }
    }

    function processParsedData(data) {
        if (!data || data.length === 0) {
                showNotification('No data found in the file.');
            showLoader(false);
            return;
        }

        appState.data = data;
        appState.headers = Object.keys(data[0]);
        appState.dataTypes = getColumnDataTypes(appState.data, appState.headers);

        // Clean up UI
        resetDashboard();
        emptyState.style.display = 'none';
        addChartBtn.disabled = false;
        addChartCard(); // Add one chart by default
        showLoader(false);
    }

    function resetDashboard() {
        appState.chartInstances.forEach(chart => chart.destroy());
        appState.chartInstances.clear();
        chartGrid.innerHTML = '';
    }

    // --- CHART CARD MANAGEMENT ---
    function addChartCard() {
        const template = document.getElementById('chart-card-template');
        const newCard = template.content.cloneNode(true).firstElementChild;
        const cardId = `chart-${Date.now()}`;
        newCard.id = cardId;

        // Populate dropdowns
        const chartTypeSelect = newCard.querySelector('.chart-type-select');
        const xAxisSelect = newCard.querySelector('.x-axis-select');
        const yAxisSelect = newCard.querySelector('.y-axis-select');
        const groupBySelect = newCard.querySelector('.group-by-select');

        Object.entries(CHART_TYPES).forEach(([key, value]) => {
            const option = new Option(value, key);
            chartTypeSelect.add(option);
        });

        appState.headers.forEach(header => {
            xAxisSelect.add(new Option(header, header));
            yAxisSelect.add(new Option(header, header));
            groupBySelect.add(new Option(header, header));
        });

        const numericColumns = appState.headers.filter(h => appState.dataTypes[h] === 'numeric');
        const categoricalColumns = appState.headers.filter(h => appState.dataTypes[h] === 'categorical' || appState.dataTypes[h] === 'date');

        if (categoricalColumns.length > 0) {
            xAxisSelect.value = categoricalColumns[0];
        }
        if (numericColumns.length > 0) {
            yAxisSelect.value = numericColumns[0];
        }

        chartGrid.appendChild(newCard);
        updateChart(newCard);
    }

    function handleChartControlChange(event) {
        if (event.target.matches('select')) {
            const card = event.target.closest('.chart-card');
            updateChart(card);
        }
    }

    function handleChartCardClick(event) {
        const btn = event.target.closest('button');
        if (!btn) return;
        const card = btn.closest('.chart-card');

        if (btn.classList.contains('remove-btn')) {
            if (appState.chartInstances.has(card.id)) {
                appState.chartInstances.get(card.id).destroy();
                appState.chartInstances.delete(card.id);
            }
            card.style.animation = 'fadeOut 0.3s forwards';
            card.addEventListener('animationend', () => card.remove());
        } else if (btn.classList.contains('export-btn')) {
            exportChart(card);
        }
    }

    function exportChart(card) {
        const chartInstance = appState.chartInstances.get(card.id);
        if (!chartInstance) return;
        const link = document.createElement('a');
        link.href = chartInstance.toBase64Image();
        link.download = `${card.querySelector('.chart-type-select option:checked').textContent.replace(/\s/g, '_')}.png`;
        link.click();
    }

    // --- CHART GENERATION & UPDATING ---
    function updateChart(card) {
        const cardId = card.id;
        const chartType = card.querySelector('.chart-type-select').value;
        const xCol = card.querySelector('.x-axis-select').value;
        const yCol = card.querySelector('.y-axis-select').value;
        const groupByCol = card.querySelector('.group-by-select').value;
        const aggregationMethod = card.querySelector('.aggregation-method-select').value;
        const groupByControl = card.querySelector('.group-by-control');

        const needsGroupBy = ['groupedBar', 'horizontalGroupedBar', 'stackedBar', 'horizontalStackedBar', 'percentageStackedBar', 'horizontalPercentageStackedBar', 'tornado'].includes(chartType);
        groupByControl.style.display = needsGroupBy ? 'flex' : 'none';

        if (xCol === '(Select Column)' || yCol === '(Select Column)' || (needsGroupBy && groupByCol === '(Select Column)')) {
            // Clear canvas if selections are invalid
            const ctx = card.querySelector('canvas').getContext('2d');
            if (appState.chartInstances.has(cardId)) {
                appState.chartInstances.get(cardId).destroy();
                appState.chartInstances.delete(cardId);
            }
            return;
        }

        const ctx = card.querySelector('canvas').getContext('2d');
        const config = getChartConfig(chartType, xCol, yCol, groupByCol, aggregationMethod);

        if (appState.chartInstances.has(cardId)) {
            appState.chartInstances.get(cardId).destroy();
        }

        const newChart = new Chart(ctx, config);
        appState.chartInstances.set(cardId, newChart);
    }


    function updateChartOptions(chartInstance) {
        const isDarkMode = document.body.classList.contains('dark-mode');
        const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const textColor = isDarkMode ? '#edf2f7' : '#1a202c';

        chartInstance.options.scales.x.grid.color = gridColor;
        chartInstance.options.scales.y.grid.color = gridColor;
        chartInstance.options.scales.x.ticks.color = textColor;
        chartInstance.options.scales.y.ticks.color = textColor;
        chartInstance.options.plugins.legend.labels.color = textColor;
        chartInstance.options.plugins.title.color = textColor;
        if(chartInstance.options.plugins.datalabels){
             chartInstance.options.plugins.datalabels.color = textColor;
        }
    }

    function getChartConfig(type, xCol, yCol, groupByCol, aggregationMethod = 'sum') {
        const isDarkMode = document.body.classList.contains('dark-mode');
        const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const textColor = isDarkMode ? '#edf2f7' : '#1a202c';

        let labels = [];
        let data = [];

        // --- DATA PREPARATION ---
        if (aggregationMethod === 'none') {
            labels = appState.data.map(row => row[xCol]);
            data = appState.data.map(row => row[yCol]);
        } else {
            const aggregatedData = {};
            const counts = {};
                let hasInvalidData = false;

            appState.data.forEach(row => {
                const xValue = row[xCol];
                    const yValueRaw = row[yCol];
                    const yValue = aggregationMethod === 'count' ? 1 : parseFloat(yValueRaw);

                    if (xValue === null || xValue === undefined) return;

                    if (aggregationMethod !== 'count' && isNaN(yValue)) {
                        hasInvalidData = true;
                        return;
                    }

                if (!aggregatedData[xValue]) {
                    aggregatedData[xValue] = 0;
                    counts[xValue] = 0;
                }

                if (aggregationMethod === 'sum' || aggregationMethod === 'count') {
                    aggregatedData[xValue] += yValue;
                } else if (aggregationMethod === 'avg') {
                    aggregatedData[xValue] += yValue;
                    counts[xValue] += 1;
                }
            });

                if (hasInvalidData) {
                    showNotification(`Warning: Column "${yCol}" contains non-numeric data. Aggregation may be incorrect.`, false);
                }

            if (aggregationMethod === 'avg') {
                Object.keys(aggregatedData).forEach(key => {
                    aggregatedData[key] = counts[key] > 0 ? aggregatedData[key] / counts[key] : 0;
                });
            }

            labels = Object.keys(aggregatedData);
            data = Object.values(aggregatedData);
        }

        // --- BASE CHART CONFIGURATION ---
        const baseConfig = {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: yCol,
                    data,
                    backgroundColor: currentPalette,
                    borderColor: currentPalette,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, labels: { color: textColor } },
                    title: { display: true, text: `${CHART_TYPES[type]}: ${yCol} by ${xCol}`, color: textColor },
                    datalabels: {
                        display: true,
                        anchor: 'end',
                        align: 'top',
                        color: textColor,
                        formatter: (value, context) => {
                            const raw = context.dataset.data[context.dataIndex];
                            if (raw === null || raw === undefined) return null;
                            if (Array.isArray(raw)) return `${raw[0]}-${raw[1]}`;
                            if (typeof value === 'number') return Math.round(value * 100) / 100;
                            return value;
                        }
                    }
                },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: textColor } },
                    y: { grid: { color: gridColor }, ticks: { color: textColor } }
                }
            }
        };

        const chartConfigurators = {
            horizontalBar: (config) => {
                config.options.indexAxis = 'y';
                config.options.plugins.datalabels.align = 'right';
                config.options.plugins.datalabels.anchor = 'end';
                return config;
            },
            horizontalGroupedBar: (config) => chartConfigurators.horizontalBar(config),
            horizontalStackedBar: (config) => {
                config = chartConfigurators.horizontalBar(config);
                config.options.scales.x.stacked = true;
                config.options.scales.y.stacked = true;
                config.options.plugins.datalabels.anchor = 'center';
                config.options.plugins.datalabels.align = 'center';
                return config;
            },
            stackedBar: (config) => {
                config.options.scales.x.stacked = true;
                config.options.scales.y.stacked = true;
                config.options.plugins.datalabels.anchor = 'center';
                config.options.plugins.datalabels.align = 'center';
                return config;
            },
            horizontalPercentageStackedBar: (config) => {
                config = chartConfigurators.horizontalStackedBar(config);
                // ... percentage logic here
                return config;
            },
            percentageStackedBar: (config) => {
                config = chartConfigurators.stackedBar(config);
                // ... percentage logic here
                return config;
            },
            barWithLine: (config, { yCol }) => {
                const avgData = config.data.datasets[0].data;
                config.data.datasets.push({
                    type: 'line',
                    label: `Average ${yCol}`,
                    data: avgData.map(() => avgData.reduce((a, b) => a + b, 0) / avgData.length),
                    borderColor: '#ff6384',
                    backgroundColor: '#ff6384',
                    fill: false,
                    datalabels: { display: false }
                });
                return config;
            },
            sortedBarAsc: (config) => {
                const zipped = config.data.labels.map((label, i) => ({label, value: config.data.datasets[0].data[i]}));
                zipped.sort((a, b) => a.value - b.value);
                config.data.labels = zipped.map(d => d.label);
                config.data.datasets[0].data = zipped.map(d => d.value);
                return config;
            },
            sortedBarDesc: (config) => {
                const zipped = config.data.labels.map((label, i) => ({label, value: config.data.datasets[0].data[i]}));
                zipped.sort((a, b) => b.value - a.value);
                config.data.labels = zipped.map(d => d.label);
                config.data.datasets[0].data = zipped.map(d => d.value);
                return config;
            },
            barWithNegative: (config) => {
                config.options.plugins.datalabels.align = (context) => context.dataset.data[context.dataIndex] >= 0 ? 'top' : 'bottom';
                return config;
            },
            floatingBar: (config, { xCol, yCol }) => {
                config.data.datasets[0].data = appState.data.map(row => (row[yCol] || "0-0").split('-').map(Number)).filter(d => d.length === 2);
                config.data.labels = appState.data.map(row => row[xCol]).slice(0, config.data.datasets[0].data.length);
                config.options.plugins.datalabels.anchor = 'center';
                config.options.plugins.datalabels.align = 'center';
                return config;
            },
            roundedBar: (config) => {
                config.data.datasets.forEach(ds => { ds.borderRadius = 5; });
                return config;
            },
            customColorBar: (config) => {
                config.data.datasets[0].backgroundColor = COLOR_PALETTES.vibrant;
                return config;
            },
            dashedBorderBar: (config) => {
                config.data.datasets[0].borderDash = [5, 5];
                config.data.datasets[0].borderWidth = 2;
                return config;
            },
            logarithmicBar: (config) => {
                config.options.scales.y.type = 'logarithmic';
                return config;
            },
            tornado: (config) => {
                if (config.data.datasets.length >= 2) {
                    config.options.indexAxis = 'y';
                    config.options.scales.x.stacked = true;
                    config.data.datasets[0].data = config.data.datasets[0].data.map(d => -d);
                    config.options.plugins.tooltip = { callbacks: { label: c => `${c.dataset.label}: ${Math.abs(c.raw)}` }};
                    config.options.scales.x.ticks = { callback: v => Math.abs(v) };
                    config.options.plugins.datalabels.formatter = (value) => Math.abs(Math.round(value * 100) / 100);
                    config.options.plugins.datalabels.align = (context) => context.datasetIndex === 0 ? 'left' : 'right';
                }
                return config;
            },
            waterfall: (config, {xCol}) => {
                const waterfallBaseData = config.data.datasets[0].data;
                const waterfallData = [waterfallBaseData[0]];
                for(let i = 1; i < waterfallBaseData.length; i++) {
                    waterfallData.push(waterfallBaseData[i] - waterfallBaseData[i-1]);
                }
                config.data.datasets[0].data = waterfallData;
                config.data.datasets[0].backgroundColor = waterfallData.map(v => v >= 0 ? 'rgba(75, 192, 192, 0.8)' : 'rgba(255, 99, 132, 0.8)');
                config.options.plugins.title.text = `Waterfall Chart (Change over ${xCol})`;
                return config;
            }
        };

        const needsGroupBy = ['groupedBar', 'horizontalGroupedBar', 'stackedBar', 'horizontalStackedBar', 'percentageStackedBar', 'horizontalPercentageStackedBar', 'tornado'].includes(type);
        if (needsGroupBy) {
            const groupedData = {};
            const xValues = new Set();
            const groupValues = new Set();
            appState.data.forEach(row => {
                const x = row[xCol];
                const group = row[groupByCol];
                const y = parseFloat(row[yCol]);
                if (x === null || group === null || isNaN(y)) return;

                xValues.add(x);
                groupValues.add(group);

                if (!groupedData[group]) groupedData[group] = {};
                if (!groupedData[group][x]) groupedData[group][x] = 0;
                groupedData[group][x] += y;
            });

            const sortedX = Array.from(xValues).sort();
            const sortedGroups = Array.from(groupValues).sort();

            baseConfig.data.labels = sortedX;
            baseConfig.data.datasets = sortedGroups.map((group, i) => {
                return {
                    label: group,
                    data: sortedX.map(x => groupedData[group][x] || 0),
                    backgroundColor: currentPalette[i % currentPalette.length],
                };
            });
        }

        const configurator = chartConfigurators[type] || (() => baseConfig);
        return configurator(baseConfig, { xCol, yCol, groupByCol, isDarkMode });
    }


    // --- UTILITY FUNCTIONS ---
    function getColumnDataTypes(data, headers) {
        const dataTypes = {};
        headers.forEach(header => {
            const values = data.map(row => row[header]).filter(val => val !== null && val !== undefined);
            if (values.every(val => typeof val === 'number')) {
                dataTypes[header] = 'numeric';
            } else if (values.every(val => !isNaN(Date.parse(val)))) {
                dataTypes[header] = 'date';
            } else {
                dataTypes[header] = 'categorical';
            }
        });
        return dataTypes;
    }

    function showLoader(show) {
        loader.classList.toggle('show', show);
    }

    function showNotification(message, isError = true) {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.style.backgroundColor = isError ? 'var(--danger-color)' : 'var(--accent-color)';
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    // --- INITIALIZATION ---
    setInitialTheme();
});
