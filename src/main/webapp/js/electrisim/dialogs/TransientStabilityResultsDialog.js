// TransientStabilityResultsDialog.js - ANDES TDS results with charts
(function () {
    function loadChartJs() {
        return new Promise((resolve, reject) => {
            if (typeof Chart !== 'undefined') {
                resolve(Chart);
                return;
            }
            const existing = document.querySelector('script[data-electrisim-chartjs]');
            if (existing) {
                existing.addEventListener('load', () => resolve(window.Chart));
                existing.addEventListener('error', () => reject(new Error('Chart.js failed')));
                return;
            }
            const script = document.createElement('script');
            script.src = 'js/vendor/chart.umd.min.js';
            script.dataset.electrisimChartjs = '1';
            script.onload = () => resolve(window.Chart);
            script.onerror = () => reject(new Error('Chart.js failed to load'));
            document.head.appendChild(script);
        });
    }

    class TransientStabilityResultsDialog {
        constructor(results) {
            this.results = results || {};
            this.title = 'Transient Stability Results (ANDES)';
            this.charts = [];
        }

        show() {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5); z-index: 10000;
                display: flex; align-items: center; justify-content: center;
                padding: 16px; box-sizing: border-box;
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: white; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.25);
                width: min(1100px, 100%); max-height: 92vh; overflow: hidden;
                font-family: Arial, sans-serif; display: flex; flex-direction: column;
            `;

            const header = document.createElement('div');
            header.style.cssText = 'padding: 20px 24px 12px; border-bottom: 1px solid #eee; flex-shrink: 0;';
            const title = document.createElement('h2');
            title.textContent = this.title;
            title.style.cssText = 'margin: 0 0 10px 0; font-size: 20px;';
            header.appendChild(title);
            header.appendChild(this.buildSummary());
            dialog.appendChild(header);

            const body = document.createElement('div');
            body.style.cssText = 'flex: 1; overflow-y: auto; padding: 16px 24px;';
            const swing = this.buildSwing();
            if (swing) body.appendChild(swing);
            const chartsHost = document.createElement('div');
            chartsHost.id = 'tds-charts-host';
            body.appendChild(chartsHost);

            if (this.results.defaults_applied?.length) {
                const details = document.createElement('details');
                details.style.marginTop = '12px';
                details.innerHTML = `<summary style="cursor:pointer;font-weight:600;">Defaults applied (${this.results.defaults_applied.length})</summary>`;
                const ul = document.createElement('ul');
                ul.style.cssText = 'font-size:12px;color:#555;margin:8px 0;';
                this.results.defaults_applied.forEach((d) => {
                    const li = document.createElement('li');
                    li.textContent = d;
                    ul.appendChild(li);
                });
                details.appendChild(ul);
                body.appendChild(details);
            }
            if (this.results.warnings?.length) {
                const warn = document.createElement('div');
                warn.style.cssText = 'margin-top:10px;padding:10px;background:#fff3cd;border-radius:4px;font-size:12px;';
                warn.innerHTML = '<strong>Warnings</strong><ul style="margin:6px 0 0;">' +
                    this.results.warnings.map((w) => `<li>${w}</li>`).join('') + '</ul>';
                body.appendChild(warn);
            }
            const shed = this.results.load_shedding;
            if (shed?.enabled) {
                // Each step the scheme took: when, what it saw, how much it shed.
                const box = document.createElement('div');
                box.style.cssText = 'margin-top:10px;padding:10px;background:#e7f1ff;border-radius:4px;font-size:12px;';
                const unit = shed.trigger === 'loading' ? 'pu of rating' : 'Hz';
                const rows = (shed.steps || []).map((s) => `<tr><td>${Number(s.t_s).toFixed(3)}</td>`
                    + `<td>${Number(s.trigger_value).toFixed(3)}</td>`
                    + `<td>${Number(s.shed_mw).toFixed(3)}</td><td>${Number(s.kept_percent).toFixed(1)}</td></tr>`).join('');
                box.innerHTML = `<strong>Load shedding</strong> (${shed.trigger}, pickup ${shed.pickup} ${unit}, `
                    + `${shed.delay_s} s, steps of ${shed.step_percent} %, at most ${shed.max_steps}; `
                    + `${(shed.loads || []).length} load(s)): `
                    + (rows
                        ? `${Number(shed.shed_mw).toFixed(3)} MW shed<table style="margin-top:6px;border-collapse:collapse;">`
                          + `<tr><th style="text-align:left;padding-right:12px;">t (s)</th><th style="text-align:left;padding-right:12px;">Trigger (${unit})</th>`
                          + `<th style="text-align:left;padding-right:12px;">Shed (MW)</th><th style="text-align:left;">Kept (%)</th></tr>${rows}</table>`
                        : 'nothing shed.');
                body.appendChild(box);
            }
            const eased = (this.results.rectifier_easing || []).filter((e) => e.eased_from_s != null);
            if (eased.length) {
                // Rectifiers that handed their DC bus to its stores: when, how far, and how much the stores could take.
                const box = document.createElement('div');
                box.style.cssText = 'margin-top:10px;padding:10px;background:#e7f1ff;border-radius:4px;font-size:12px;';
                const rows = eased.map((e) => `<tr><td style="padding-right:12px;">${e.label}</td><td>${Number(e.eased_from_s).toFixed(3)}</td>`
                    + `<td>${Number(e.min_factor).toFixed(2)}</td><td>${Number(e.spare_mw).toFixed(3)}</td></tr>`).join('');
                box.innerHTML = `<strong>Rectifiers handing over to their stores</strong> (${eased.length})`
                    + '<table style="margin-top:6px;border-collapse:collapse;"><tr><th style="text-align:left;padding-right:12px;">Rectifier</th>'
                    + '<th style="text-align:left;padding-right:12px;">From (s)</th><th style="text-align:left;padding-right:12px;">Lowest (of its load)</th>'
                    + `<th style="text-align:left;">Stores' spare (MW)</th></tr>${rows}</table>`;
                body.appendChild(box);
            }
            const rt = this.results.ride_through;
            if (rt?.enabled && rt.pass === false) {
                const fail = document.createElement('div');
                fail.style.cssText = 'margin-top:10px;padding:10px;background:#f8d7da;border-radius:4px;font-size:12px;color:#842029;';
                fail.innerHTML = `<strong>Computational load ride-through failed</strong> at t=${rt.fail_time_s ?? '—'} s, V=${rt.fail_voltage_pu ?? '—'} pu (POI RMS trace vs curve).`;
                body.appendChild(fail);
            }
            dialog.appendChild(body);

            const buttonRow = document.createElement('div');
            buttonRow.style.cssText = 'display:flex;gap:10px;padding:14px 24px;border-top:1px solid #e9ecef;background:#fafbfc;';
            const exportBtn = document.createElement('button');
            exportBtn.textContent = 'Export CSV';
            exportBtn.style.cssText = 'background:#28a745;color:white;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;';
            exportBtn.onclick = () => this.exportCsv();
            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.style.cssText = 'background:#6c757d;color:white;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;margin-left:auto;';
            closeBtn.onclick = () => {
                this.charts.forEach((c) => c.destroy?.());
                document.body.removeChild(overlay);
            };
            buttonRow.appendChild(exportBtn);
            buttonRow.appendChild(closeBtn);
            dialog.appendChild(buttonRow);

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            import('../utils/dialogStyles.js').then(({ attachBackdropCloseHandler }) => {
                attachBackdropCloseHandler(overlay, dialog, () => {
                    this.charts.forEach((c) => c.destroy?.());
                    if (overlay.parentNode) document.body.removeChild(overlay);
                });
            }).catch(() => {});

            this.renderCharts(chartsHost);
        }

        buildSummary() {
            const r = this.results;
            const card = document.createElement('div');
            card.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;font-size:13px;';
            const items = [
                ['Status', r.converged ? 'Completed' : 'Failed'],
                ['tf (s)', r.tf],
                ['Points', r.n_points],
                ['Generators', r.n_generators],
                ['Buses', r.n_buses],
                ['f base (Hz)', r.frequency_base_hz]
            ];
            if (r.pcs?.length) items.push(['PCS', r.pcs.length]);
            const poi = r.poi_metrics || {};
            if (poi.poi_bus) {
                // By the bus's diagram label, figures rounded (the cell id and
                // 49.758666641011885 Hz were shown).
                const round = (x, d) => (x == null || !isFinite(x) ? '—' : Number(x).toFixed(d));
                items.push(['POI bus', poi.poi_bus_label || poi.poi_bus]);
                items.push(['POI V min (pu)', round(poi.v_min_pu, 4)]);
                items.push(['f nadir (Hz)', round(poi.frequency_nadir_hz, 3)]);
                items.push(['f final (Hz)', round(poi.frequency_final_hz, 3)]);
            }
            const rt = r.ride_through || {};
            if (rt.enabled) {
                items.push(['Ride-through', rt.pass === true ? 'PASS' : rt.pass === false ? 'FAIL' : '—']);
            }
            if (r.load_shedding?.enabled) {
                items.push(['Load shed (MW)', Number(r.load_shedding.shed_mw || 0).toFixed(3)]);
            }
            items.forEach(([k, v]) => {
                const chip = document.createElement('div');
                chip.style.cssText = 'background:#f1f3f5;padding:6px 10px;border-radius:4px;';
                chip.innerHTML = `<strong>${k}:</strong> ${v ?? '—'}`;
                card.appendChild(chip);
            });
            return card;
        }

        /** The swing rows: the grid's and each machine's, then the PCS's when given. */
        swingRows() {
            const sw = this.results.swing;
            if (!sw) return [];
            return [...(sw.grid || []), ...(sw.machines || []), ...(sw.pcs || [])];
        }

        /**
         * The power swing the grid and the machines see (from swing.from_s on): its mean, peak to
         * peak, RMS, steepest ramp, strongest lines and the torsional band's RMS. The backend gave
         * it and the dialog showed none of it - the swing study's whole answer.
         */
        buildSwing() {
            const sw = this.results.swing;
            const rows = this.swingRows();
            if (!sw || !rows.length) return null;
            const f = (x, d = 3) => (x == null || !isFinite(x) ? '—' : Number(x).toFixed(d));
            const band = sw.band_hz || rows[0].band_hz || [];
            const wrap = document.createElement('div');
            wrap.style.cssText = 'margin-bottom:18px;';
            const h = document.createElement('h3');
            h.textContent = `Power swing (from ${f(sw.from_s, 1)} s)`;
            h.style.cssText = 'margin:0 0 8px;font-size:14px;';
            wrap.appendChild(h);
            const table = document.createElement('table');
            table.style.cssText = 'border-collapse:collapse;font-size:12px;width:100%;';
            const head = ['Source', 'Mean (MW)', 'Peak to peak (MW)', 'RMS (MW)', 'Max ramp (MW/s)',
                'Strongest lines (Hz: MW)', `${f(band[0], 0)}-${f(band[1], 0)} Hz RMS (MW)`];
            const cell = (txt, th) => {
                const c = document.createElement(th ? 'th' : 'td');
                c.textContent = txt;
                c.style.cssText = `border:1px solid #dee2e6;padding:4px 6px;text-align:${th ? 'left' : 'right'};${th ? 'background:#f1f3f5;' : ''}`;
                return c;
            };
            const tr0 = document.createElement('tr');
            head.forEach(x => tr0.appendChild(cell(x, true)));
            table.appendChild(tr0);
            rows.forEach((r) => {
                const tr = document.createElement('tr');
                const lines = (r.dominant || []).slice(0, 3).map(d => `${f(d.f_hz, 2)}: ${f(d.amplitude_mw, 2)}`).join(', ');
                const bandRms = r.band_resolved ? f(r.band_rms_mw) : `not resolved (Nyquist ${f(r.nyquist_hz, 0)} Hz)`;
                [r.name || r.label || r.id, f(r.mean_mw), f(r.peak_to_peak_mw), f(r.total_rms_mw), f(r.max_ramp_mw_per_s, 1), lines || '—', bandRms]
                    .forEach((x, i) => {
                        const c = cell(x, false);
                        if (i === 0 || i === 5 || i === 6) c.style.textAlign = 'left';
                        tr.appendChild(c);
                    });
                table.appendChild(tr);
            });
            wrap.appendChild(table);
            return wrap;
        }

        async renderCharts(host) {
            const t = this.results.time || [];
            if (!t.length) {
                host.innerHTML = '<p style="color:#666;">No time-series data returned.</p>';
                return;
            }
            let ChartCtor;
            try {
                ChartCtor = await loadChartJs();
            } catch (e) {
                host.innerHTML = `<p style="color:#c00;">${e.message}</p>`;
                return;
            }

            const palette = ['#007cba', '#e67e22', '#27ae60', '#8e44ad', '#c0392b', '#16a085', '#2c3e50'];
            const makeChart = (title, seriesArr, yLabel) => {
                if (!seriesArr?.length) return;
                const wrap = document.createElement('div');
                wrap.style.cssText = 'margin-bottom:20px;height:280px;position:relative;';
                const h = document.createElement('h3');
                h.textContent = title;
                h.style.cssText = 'margin:0 0 8px;font-size:14px;';
                const canvas = document.createElement('canvas');
                wrap.appendChild(h);
                wrap.appendChild(canvas);
                host.appendChild(wrap);
                const chart = new ChartCtor(canvas, {
                    type: 'line',
                    data: {
                        labels: t,
                        datasets: seriesArr.map((s, i) => ({
                            label: s.name || s.id,
                            data: s.values,
                            borderColor: palette[i % palette.length],
                            backgroundColor: 'transparent',
                            borderWidth: 1.5,
                            pointRadius: 0,
                            tension: 0.1
                        }))
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
                        scales: {
                            x: { title: { display: true, text: 'Time [s]' }, ticks: { maxTicksLimit: 10 } },
                            y: { title: { display: true, text: yLabel } }
                        }
                    }
                });
                this.charts.push(chart);
            };

            makeChart('Generator Speed ω (pu)', this.results.omega, 'ω [pu]');
            makeChart('Generator Angle δ (rad)', this.results.delta, 'δ [rad]');
            makeChart('Bus Voltage (pu)', this.results.bus_voltage, 'V [pu]');
            if (this.results.frequency_hz) {
                makeChart('System Frequency (Hz)', [{
                    name: 'Mean frequency',
                    values: this.results.frequency_hz
                }], 'f [Hz]');
            }
            // Each PCS through the run, by its ANDES model: its power and Q, a battery's state of
            // charge, a flywheel's speed, a grid-forming PCS's frequency.
            const pcs = this.results.pcs || [];
            if (pcs.length) {
                const label = (r) => `${r.label} (${r.source}, ${r.model})`;
                const series = (key) => pcs.filter(r => Array.isArray(r[key])).map(r => ({ name: label(r), values: r[key] }));
                makeChart('PCS active power (MW)', series('p_mw'), 'P [MW]');
                makeChart('PCS reactive power (Mvar)', series('q_mvar'), 'Q [Mvar]');
                makeChart('Batteries behind a PCS: state of charge (%)', series('soc_percent'), 'SoC [%]');
                makeChart('Flywheels behind a PCS: speed (%)', series('speed_percent'), 'Speed [%]');
                makeChart('Grid-forming PCS: frequency (Hz)', series('frequency_hz'), 'f [Hz]');
            }
            // Loads following a profile from the diagram's library, and the power each was set to.
            const followed = this.results.load_profiles || [];
            if (followed.length) {
                makeChart('Loads following a load profile (P, MW)', followed.map(lp => ({
                    name: `${lp.load} (${lp.profile}${lp.q_mode === 'constant' ? ', constant Q' : ''})`,
                    values: lp.p_mw
                })), 'P [MW]');
            }
            // The swing's spectrum: amplitude against frequency, each source on one frequency axis.
            const spectra = this.swingRows().filter(r => r.spectrum?.f_hz?.length);
            if (spectra.length) {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'margin-bottom:20px;height:280px;position:relative;';
                const h = document.createElement('h3');
                h.textContent = 'Power swing spectrum (MW)';
                h.style.cssText = 'margin:0 0 8px;font-size:14px;';
                const canvas = document.createElement('canvas');
                wrap.appendChild(h);
                wrap.appendChild(canvas);
                host.appendChild(wrap);
                this.charts.push(new ChartCtor(canvas, {
                    type: 'line',
                    data: {
                        datasets: spectra.map((r, i) => ({
                            label: r.name || r.label || r.id,
                            data: r.spectrum.f_hz.map((x, k) => ({ x, y: r.spectrum.amplitude_mw[k] })),
                            borderColor: palette[i % palette.length], backgroundColor: 'transparent',
                            borderWidth: 1.5, pointRadius: 0, tension: 0
                        }))
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, parsing: false,
                        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
                        scales: {
                            x: { type: 'linear', title: { display: true, text: 'Frequency [Hz]' } },
                            y: { title: { display: true, text: 'Amplitude [MW]' } }
                        }
                    }
                }));
            }
        }

        exportCsv() {
            const t = this.results.time || [];
            if (!t.length) return;
            const cols = ['time'];
            const series = [];
            (this.results.omega || []).forEach((s) => {
                cols.push(`omega_${s.name}`);
                series.push(s.values);
            });
            (this.results.delta || []).forEach((s) => {
                cols.push(`delta_${s.name}`);
                series.push(s.values);
            });
            (this.results.bus_voltage || []).forEach((s) => {
                cols.push(`v_${s.name}`);
                series.push(s.values);
            });
            if (this.results.frequency_hz) {
                cols.push('frequency_hz');
                series.push(this.results.frequency_hz);
            }
            (this.results.pcs || []).forEach((r) => {
                [['p_mw', 'p_mw'], ['q_mvar', 'q_mvar'], ['soc_percent', 'soc_percent'], ['speed_percent', 'speed_percent'],
                    ['frequency_hz', 'f_hz']].forEach(([key, col]) => {
                    if (Array.isArray(r[key])) {
                        cols.push(`${col}_${r.label}`);
                        series.push(r[key]);
                    }
                });
            });
            const rt = this.results.ride_through;
            if (rt?.enabled) {
                cols.push('ride_through_pass');
                series.push(t.map(() => (rt.pass === true ? 1 : rt.pass === false ? 0 : '')));
            }
            const lines = [cols.join(',')];
            for (let i = 0; i < t.length; i++) {
                const row = [t[i]];
                series.forEach((vals) => row.push(vals[i] ?? ''));
                lines.push(row.join(','));
            }
            const poi = this.results.poi_metrics;
            if (poi) {
                lines.push('');
                lines.push(`poi_bus,${poi.poi_bus_label ?? poi.poi_bus ?? ''}`);
                lines.push(`poi_v_min_pu,${poi.v_min_pu ?? ''}`);
                lines.push(`frequency_nadir_hz,${poi.frequency_nadir_hz ?? ''}`);
                lines.push(`frequency_final_hz,${poi.frequency_final_hz ?? ''}`);
                if (rt?.enabled) {
                    lines.push(`ride_through_pass,${rt.pass ?? ''}`);
                }
            }
            const swingRows = this.swingRows();
            if (swingRows.length) {
                lines.push('');
                lines.push(`swing_from_s,${this.results.swing.from_s ?? ''}`);
                lines.push('source,mean_mw,peak_to_peak_mw,total_rms_mw,max_ramp_mw_per_s,band_rms_mw,dominant_hz_mw');
                swingRows.forEach((r) => {
                    const dom = (r.dominant || []).map(d => `${d.f_hz}:${d.amplitude_mw}`).join(' ');
                    lines.push([r.name || r.label || r.id, r.mean_mw, r.peak_to_peak_mw, r.total_rms_mw,
                        r.max_ramp_mw_per_s, r.band_resolved ? r.band_rms_mw : '', dom].map(x => x ?? '').join(','));
                });
            }
            const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'transient_stability_results.csv';
            a.click();
            URL.revokeObjectURL(a.href);
        }
    }

    window.TransientStabilityResultsDialog = TransientStabilityResultsDialog;
})();
