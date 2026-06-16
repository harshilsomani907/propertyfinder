import React, { useState, useEffect, useRef } from "react";

const API_BASE = "https://propertyfinder-production-0b58.up.railway.app";

function App() {
  // Scraper State
  const [isScraping, setIsScraping] = useState(false);
  const [scrapePages, setScrapePages] = useState(3);

  // Autopilot Settings State
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [autopilotTime, setAutopilotTime] = useState("02:00");
  const [autopilotPages, setAutopilotPages] = useState(3);

  // Statistics State
  const [stats, setStats] = useState({
    totalCount: 0,
    rentCount: 0,
    saleCount: 0,
    scrapedToday: 0,
    citiesCount: 0,
    lastUpdated: "N/A"
  });

  // Properties Browser State
  const [properties, setProperties] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPurpose, setFilterPurpose] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterType, setFilterType] = useState("");
  const [loadingProperties, setLoadingProperties] = useState(false);

  // Logs State
  const [logs, setLogs] = useState([]);
  const logEndRef = useRef(null);

  // Selected Property for Detail View Modal
  const [selectedProperty, setSelectedProperty] = useState(null);

  // Load stats and status on mount
  useEffect(() => {
    fetchStatus();
    fetchStats();
    fetchProperties(1);
  }, []);

  // Fetch properties when page, search, or filters change
  useEffect(() => {
    fetchProperties(currentPage);
  }, [currentPage, filterPurpose, filterCity, filterType]);

  // Handle Search Debouncing/Trigger on Submit or Enter
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchProperties(1);
  };

  // SSE stream connection for logs
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/api/logs/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.log) {
          setLogs((prevLogs) => {
            const nextLogs = [...prevLogs, data.log];
            // keep last 500 logs in UI for performance
            return nextLogs.slice(-500);
          });
        }
      } catch (err) {
        console.error("Error parsing SSE data:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE stream error, re-establishing...", err);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Auto-scroll logs window
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Polling for scraping status
  useEffect(() => {
    let interval = null;
    if (isScraping) {
      interval = setInterval(() => {
        fetchStatus();
        fetchStats();
      }, 3000);
    } else {
      fetchStatus();
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isScraping]);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      const data = await res.json();
      setIsScraping(data.isScraping);
      if (data.config) {
        setAutopilotEnabled(data.config.autopilot);
        setAutopilotTime(data.config.runTime);
        setAutopilotPages(data.config.pages);
      }
    } catch (err) {
      console.error("Failed to fetch scraper status:", err);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("Failed to fetch db stats:", err);
    }
  };

  const fetchProperties = async (page) => {
    setLoadingProperties(true);
    try {
      const queryParams = new URLSearchParams({
        page: page,
        limit: 10,
        search: searchTerm,
        purpose: filterPurpose,
        city: filterCity,
        type: filterType
      });
      const res = await fetch(`${API_BASE}/api/properties?${queryParams.toString()}`);
      const data = await res.json();
      setProperties(data.properties || []);
      setTotalPages(data.pages || 1);
      setCurrentPage(data.currentPage || 1);
    } catch (err) {
      console.error("Failed to fetch properties list:", err);
    } finally {
      setLoadingProperties(false);
    }
  };

  const handleStartScrape = async () => {
    try {
      setLogs([]);
      const res = await fetch(`${API_BASE}/api/start-scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: scrapePages })
      });
      const data = await res.json();
      if (res.ok) {
        setIsScraping(true);
      } else {
        alert(data.error || "Failed to trigger scraper.");
      }
    } catch (err) {
      console.error("Failed to trigger scraper:", err);
    }
  };

  const handleStopScrape = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stop-scrape`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setIsScraping(false);
      } else {
        alert(data.error || "Failed to stop scraper.");
      }
    } catch (err) {
      console.error("Failed to abort scraper:", err);
    }
  };

  const handleSaveAutopilot = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/autopilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: autopilotEnabled,
          time: autopilotTime,
          pages: autopilotPages
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert("Autopilot configuration updated and scheduler re-synced!");
        fetchStatus();
      } else {
        alert(data.error || "Failed to save settings.");
      }
    } catch (err) {
      console.error("Failed to save autopilot configs:", err);
    }
  };

  const clearLogWindow = () => {
    setLogs([]);
  };

  // Helper to format date cleanly
  const formatTimestamp = (ts) => {
    if (!ts || ts === "N/A") return "N/A";
    const date = new Date(ts);
    return isNaN(date.getTime()) ? ts : date.toLocaleString();
  };

  return (
    <div className="dashboard-container">
      {/* 1. Header Section */}
      <header className="dashboard-header glass-panel" style={{ padding: '1.25rem 2rem' }}>
        <div className="brand-section">
          <div className="brand-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </div>
          <div className="brand-title">
            <h1>PropertyFinder Copilot</h1>
            <p>Dubai Real Estate Data Automation Hub</p>
          </div>
        </div>

        <div className="header-status">
          {autopilotEnabled && (
            <span className="badge badge-autopilot">
              <span className="pulse-dot"></span>
              Autopilot Active ({autopilotTime})
            </span>
          )}
          {isScraping ? (
            <span className="badge badge-status badge-scraping">
              <span className="pulse-dot"></span>
              Scraping in Progress
            </span>
          ) : (
            <span className="badge badge-status badge-idle">
              Scraper Idle
            </span>
          )}
        </div>
      </header>

      {/* 2. Metrics Grid */}
      <section className="metrics-grid">
        <div className="metric-card glass-panel">
          <div className="metric-icon-wrapper" style={{ borderLeft: '3px solid var(--brand-color)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand-color)" strokeWidth="2">
              <path d="M3 3v18h18" />
              <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
            </svg>
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Listings</span>
            <span className="metric-value">{stats.totalCount.toLocaleString()}</span>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-icon-wrapper" style={{ borderLeft: '3px solid var(--accent-green)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div className="metric-info">
            <span className="metric-label">Today's Scrapes</span>
            <span className="metric-value">{stats.scrapedToday}</span>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-icon-wrapper" style={{ borderLeft: '3px solid var(--accent-cyan)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
          <div className="metric-info">
            <span className="metric-label">Rentals / Sale</span>
            <span className="metric-value">
              {stats.rentCount.toLocaleString()} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>/</span> {stats.saleCount.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-icon-wrapper" style={{ borderLeft: '3px solid var(--accent-yellow)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-yellow)" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="metric-info">
            <span className="metric-label">Synced Cities</span>
            <span className="metric-value">{stats.citiesCount}</span>
          </div>
        </div>
      </section>

      {/* 3. Control Panel & Console Logs */}
      <section className="control-grid">
        {/* Scraper Control Card */}
        <div className="control-card glass-panel">
          {/* Manual Run */}
          <div className="card-section">
            <h2 className="card-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              Manual Scraping
            </h2>
            <div className="input-group">
              <label className="input-label">Scan Depth (Pages)</label>
              <div className="range-slider-container">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={scrapePages}
                  onChange={(e) => setScrapePages(parseInt(e.target.value))}
                  className="range-slider"
                  disabled={isScraping}
                />
                <span className="slider-value">{scrapePages}</span>
              </div>
            </div>
            {isScraping ? (
              <button className="btn btn-danger" onClick={handleStopScrape}>
                <span className="spinner"></span>
                Cancel Scraper Run
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleStartScrape}>
                Run Scraper
              </button>
            )}
          </div>

          <div style={{ height: '1.5rem' }}></div>

          {/* Autopilot Scheduling */}
          <div className="card-section" style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
            <h2 className="card-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              Autopilot Schedule
            </h2>

            <div className="switch-container">
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Enable Daily Run</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={autopilotEnabled}
                  onChange={(e) => setAutopilotEnabled(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="input-group">
              <label className="input-label">Daily Run Time</label>
              <input
                type="time"
                value={autopilotTime}
                onChange={(e) => setAutopilotTime(e.target.value)}
                className="text-input"
              />
            </div>

            <div className="input-group">
              <label className="input-label">Pages Depth (Daily Scrape)</label>
              <div className="range-slider-container">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={autopilotPages}
                  onChange={(e) => setAutopilotPages(parseInt(e.target.value))}
                  className="range-slider"
                />
                <span className="slider-value">{autopilotPages}</span>
              </div>
            </div>

            <button className="btn btn-secondary" onClick={handleSaveAutopilot}>
              Save Settings
            </button>
          </div>

          <div style={{ height: '1.5rem' }}></div>

          {/* Excel Download Section */}
          <div className="card-section" style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
            <h2 className="card-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Spreadsheet Export
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Download the generated Excel sheet with photo embeds, column formatting, and auto row dimensions.
            </p>
            <a
              href={`${API_BASE}/api/download-excel`}
              download
              className="btn btn-primary"
              style={{ textDecoration: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', boxShadow: 'none' }}
            >
              Download Excel File
            </a>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
              <span>Format: XLSX</span>
              <span>Last Updated: {formatTimestamp(stats.lastUpdated)}</span>
            </div>
          </div>
        </div>

        {/* Live Terminal logs */}
        <div className="terminal-card glass-panel">
          <div className="terminal-header">
            <div className="terminal-dots">
              <span className="dot dot-red"></span>
              <span className="dot dot-yellow"></span>
              <span className="dot dot-green"></span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={clearLogWindow}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Clear Log
              </button>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>LIVE_SHELL_PIPE</span>
            </div>
          </div>
          <div className="terminal-body">
            {logs.length === 0 ? (
              <div className="log-line info">⚡ Scraper log console initialized. Ready for scraping...</div>
            ) : (
              logs.map((log, i) => {
                let type = "";
                if (log.includes("[ERROR]") || log.includes("❌")) type = "error";
                else if (log.includes("✅") || log.includes("🎉") || log.includes("saved successfully")) type = "success";
                else if (log.includes("🌐") || log.includes("ℹ️") || log.includes("🔗") || log.includes("🚀")) type = "info";

                return (
                  <div key={i} className={`log-line ${type}`}>
                    {log}
                  </div>
                );
              })
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </section>

      {/* 4. Properties Browser Table */}
      <section className="browser-card glass-panel">
        <h2 className="card-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="9" y1="3" x2="9" y2="21"></line>
            <line x1="15" y1="3" x2="15" y2="21"></line>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="3" y1="15" x2="21" y2="15"></line>
          </svg>
          Properties Database Browser
        </h2>

        {/* Filter Bar */}
        <form onSubmit={handleSearchSubmit} className="filter-bar">
          <input
            type="text"
            placeholder="Search by Title, Location, Rera number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-input filter-input"
          />

          <select
            value={filterPurpose}
            onChange={(e) => { setFilterPurpose(e.target.value); setCurrentPage(1); }}
            className="filter-select"
          >
            <option value="">All Purposes</option>
            <option value="rent">Rent</option>
            <option value="sale">Sale</option>
          </select>

          <select
            value={filterCity}
            onChange={(e) => { setFilterCity(e.target.value); setCurrentPage(1); }}
            className="filter-select"
          >
            <option value="">All Cities</option>
            <option value="Dubai">Dubai</option>
            <option value="Abu Dhabi">Abu Dhabi</option>
            <option value="Sharjah">Sharjah</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
            className="filter-select"
          >
            <option value="">All Types</option>
            <option value="Apartment">Apartment</option>
            <option value="Villa">Villa</option>
            <option value="Townhouse">Townhouse</option>
            <option value="Penthouse">Penthouse</option>
          </select>

          <button type="submit" className="btn btn-secondary" style={{ width: 'auto', padding: '0 20px' }}>
            Search
          </button>
        </form>

        {/* Table representation */}
        <div className="table-responsive">
          {loadingProperties ? (
            <div className="no-records">
              <span className="spinner" style={{ width: '30px', height: '30px', borderColor: 'var(--text-secondary)' }}></span>
              <p style={{ marginTop: '10px' }}>Fetching properties from database...</p>
            </div>
          ) : properties.length === 0 ? (
            <div className="no-records">
              <p>No properties matching the current criteria found in MongoDB.</p>
            </div>
          ) : (
            <table className="property-table">
              <thead>
                <tr>
                  <th>Property Details</th>
                  <th>Type / Purpose</th>
                  <th>Price</th>
                  <th>Specifications</th>
                  <th>Agent Contact</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((prop) => {
                  const formatPrice = () => {
                    const cleanVal = prop.price;
                    const cleanFreq = prop.price_frequency ? `/${prop.price_frequency}` : "";
                    return `AED ${cleanVal.toLocaleString()}${cleanFreq}`;
                  };

                  return (
                    <tr key={prop._id}>
                      <td>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <img
                            src={prop.img_links && prop.img_links.length > 0 ? prop.img_links[0] : "https://placehold.co/100x70?text=No+Image"}
                            alt="property preview"
                            className="cell-photo"
                            onError={(e) => {
                              e.target.src = "https://placehold.co/100x70?text=No+Image";
                            }}
                          />
                          <div>
                            <span className="cell-title" title={prop.title}>{prop.title}</span>
                            <span className="cell-subtitle">{prop.location || `${prop.city_area}, ${prop.city}`}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff' }}>
                            {prop.property_type || "Apartment"}
                          </span>
                          <span className={`badge ${prop.purpose === 'sale' ? 'badge-sale' : 'badge-rent'}`} style={{ width: 'fit-content' }}>
                            For {prop.purpose}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="cell-price">{formatPrice()}</span>
                      </td>
                      <td>
                        <div className="prop-specs">
                          <span className="spec-item" title="Bedrooms">
                            🛏️ {prop.beds || "N/A"}
                          </span>
                          <span className="spec-item" title="Bathrooms">
                            🛁 {prop.baths || "N/A"}
                          </span>
                          <span className="spec-item" title="Area">
                            📐 {prop.area} sqft
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="agent-info">
                          <span className="agent-name">{prop.agentName || "N/A"}</span>
                          <div className="agent-contacts">
                            {prop.agentPhone && prop.agentPhone !== "N/A" && (
                              <a href={`tel:${prop.agentPhone}`} className="contact-btn contact-phone" title="Call Agent">
                                📞 Call
                              </a>
                            )}
                            {prop.agentWhatsApp && prop.agentWhatsApp !== "N/A" && (
                              <a
                                href={`https://wa.me/${prop.agentWhatsApp.replace(/[^0-9]/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                                className="contact-btn contact-wa"
                                title="WhatsApp Agent"
                              >
                                💬 WA
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.8rem', width: 'auto' }}
                          onClick={() => setSelectedProperty(prop)}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination bar */}
        {properties.length > 0 && (
          <div className="pagination">
            <div className="pagination-info">
              Showing Page {currentPage} of {totalPages}
            </div>
            <div className="pagination-buttons">
              <button
                className="pagination-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
              >
                Previous
              </button>
              <button
                className="pagination-btn"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => prev + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 5. Property Details Modal Overlay */}
      {selectedProperty && (
        <div className="modal-overlay" onClick={() => setSelectedProperty(null)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedProperty(null)}>✕</button>
            <h3 className="modal-title">{selectedProperty.title}</h3>

            <div className="modal-grid">
              <div className="modal-field">
                <div className="modal-field-label">Purpose & Type</div>
                <div className="modal-field-value" style={{ textTransform: 'capitalize' }}>
                  For {selectedProperty.purpose} - {selectedProperty.property_type}
                </div>
              </div>

              <div className="modal-field">
                <div className="modal-field-label">Price</div>
                <div className="modal-field-value" style={{ color: 'var(--brand-color)', fontWeight: 'bold' }}>
                  AED {selectedProperty.price.toLocaleString()} {selectedProperty.price_frequency ? `/${selectedProperty.price_frequency}` : ""}
                </div>
              </div>

              <div className="modal-field">
                <div className="modal-field-label">Location Details</div>
                <div className="modal-field-value">
                  {selectedProperty.location || "N/A"}
                </div>
              </div>

              <div className="modal-field">
                <div className="modal-field-label">City / Community</div>
                <div className="modal-field-value">
                  {selectedProperty.city} - {selectedProperty.city_area || "N/A"}
                </div>
              </div>

              <div className="modal-field">
                <div className="modal-field-label">Size (Sqft)</div>
                <div className="modal-field-value">
                  {selectedProperty.area} sqft
                </div>
              </div>

              <div className="modal-field">
                <div className="modal-field-label">Beds & Baths</div>
                <div className="modal-field-value">
                  {selectedProperty.beds} Bedrooms / {selectedProperty.baths} Bathrooms
                </div>
              </div>

              <div className="modal-field">
                <div className="modal-field-label">Price per Sqft</div>
                <div className="modal-field-value">
                  {selectedProperty.price_per_sqft ? `AED ${selectedProperty.price_per_sqft.toFixed(2)}` : "N/A"}
                </div>
              </div>

              <div className="modal-field">
                <div className="modal-field-label">Verification Status</div>
                <div className="modal-field-value">
                  {selectedProperty.verified ? "✅ Verified Listing" : "❌ Not Verified"}
                </div>
              </div>

              <div className="modal-field">
                <div className="modal-field-label">RERA Permit Number</div>
                <div className="modal-field-value">
                  {selectedProperty.permitNumber || selectedProperty.referenceId || "N/A"}
                </div>
              </div>

              <div className="modal-field">
                <div className="modal-field-label">Listed On</div>
                <div className="modal-field-value">
                  {selectedProperty.listed_on ? selectedProperty.listed_on.substring(0, 10) : "N/A"}
                </div>
              </div>

              <div className="modal-field">
                <div className="modal-field-label">Agent Contact</div>
                <div className="modal-field-value">
                  {selectedProperty.agentName} | Call: {selectedProperty.agentPhone || "N/A"}
                </div>
              </div>

              <div className="modal-field">
                <div className="modal-field-label">Furnishing</div>
                <div className="modal-field-value" style={{ textTransform: 'capitalize' }}>
                  {selectedProperty.furnishing || "N/A"}
                </div>
              </div>

              {selectedProperty.link && (
                <div className="modal-field" style={{ gridColumn: '1 / -1' }}>
                  <div className="modal-field-label">Listing Link</div>
                  <div className="modal-field-value">
                    <a href={selectedProperty.link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)' }}>
                      Open Original Property Finder Listing ↗
                    </a>
                  </div>
                </div>
              )}

              {selectedProperty.amenities && selectedProperty.amenities.length > 0 && (
                <div className="modal-field" style={{ gridColumn: '1 / -1' }}>
                  <div className="modal-field-label">Amenities</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {selectedProperty.amenities.map((amenity, idx) => (
                      <span key={idx} style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '3px 8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedProperty.description && (
                <div className="modal-desc">
                  <strong>Description:</strong>
                  <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', maxHeight: '200px', overflowY: 'auto', paddingRight: '8px' }}>
                    {selectedProperty.description}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
