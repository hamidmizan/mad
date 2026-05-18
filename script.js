let scale = 1, pointX = 0, pointY = 0, start = { x: 0, y: 0 }, isPanning = false;
let stops = JSON.parse(localStorage.getItem('stops')) || [];
let routes = JSON.parse(localStorage.getItem('routes')) || [];
let tempCoord = {}, activeStopId, isConnecting = false, connectingFrom = null;

const BUS_TYPES = {
    bus_kota: { name: 'Bus Kota', color: 'blue', speed: 40, cost: 3000 },
    brt: { name: 'BRT', color: 'red', speed: 60, cost: 5000 },
    bus_mini: { name: 'Bus Mini', color: 'green', speed: 30, cost: 2000 }
};

let mapSvg, mapTransform, stopLayer, routeLayer;

// --- UTILS ---
const toggle = (id, show) => document.getElementById(id).classList.toggle('hidden', !show);
const save = () => { localStorage.setItem('stops', JSON.stringify(stops)); localStorage.setItem('routes', JSON.stringify(routes)); render(); };

async function initApp() {
    const response = await fetch('palembang-map.svg');
    document.getElementById('map-container').innerHTML = await response.text();
    mapSvg = document.querySelector('svg');
    
    // Setup Layers
    mapTransform = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    while (mapSvg.firstChild) mapTransform.appendChild(mapSvg.firstChild);
    
    routeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    stopLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    mapTransform.append(routeLayer, stopLayer);
    mapSvg.appendChild(mapTransform);

    setupEvents();
    render();
}

function setupEvents() {
    // Zoom & Pan
    mapSvg.onwheel = (e) => {
        e.preventDefault();
        const oldScale = scale;
        scale = Math.min(Math.max(0.3, scale + (e.deltaY > 0 ? -0.1 : 0.1)), 8);
        pointX -= (e.clientX - pointX) * (scale / oldScale - 1);
        pointY -= (e.clientY - pointY) * (scale / oldScale - 1);
        mapTransform.setAttribute("transform", `translate(${pointX}, ${pointY}) scale(${scale})`);
    };

    mapSvg.onmousedown = (e) => {
        if (e.target.tagName === 'image') return;
        isPanning = true;
        start = { x: e.clientX - pointX, y: e.clientY - pointY };
    };

    window.onmousemove = (e) => { if (isPanning) { pointX = e.clientX - start.x; pointY = e.clientY - start.y; mapTransform.setAttribute("transform", `translate(${pointX}, ${pointY}) scale(${scale})`); } };
    window.onmouseup = () => isPanning = false;

    // Double Click Map
    mapSvg.ondblclick = (e) => {
        const pt = mapSvg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const cursor = pt.matrixTransform(mapTransform.getScreenCTM().inverse());
        tempCoord = { x: cursor.x, y: cursor.y };
        toggle('modal-halte', true);
    };

    // Close popups
    document.querySelectorAll('.btn-batal').forEach(b => b.onclick = () => { toggle('modal-halte', false); toggle('modal-rute', false); isConnecting = false; });
}

function render() {
    stopLayer.innerHTML = stops.map(s => `
        <g class="stop-node" data-id="${s.id}">
            <image href="images.png" x="${s.x-15}" y="${s.y-15}" width="30" height="30" style="cursor:pointer" onclick="handleStopClick(event, '${s.id}')" />
            <text x="${s.x}" y="${s.y+25}" text-anchor="middle" style="font-size:12px; font-weight:bold; fill:#2c3e50; pointer-events:none">${s.name}</text>
        </g>
    `).join('');

    routeLayer.innerHTML = routes.map(r => {
        const sA = stops.find(s => s.id === r.from), sB = stops.find(s => s.id === r.to);
        return sA && sB ? `<line x1="${sA.x}" y1="${sA.y}" x2="${sB.x}" y2="${sB.y}" stroke="${BUS_TYPES[r.busType].color}" stroke-width="4" />` : '';
    }).join('');

    updateSelects();
}

function handleStopClick(e, id) {
    e.stopPropagation();
    if (isConnecting) {
        if (connectingFrom !== id) {
            activeStopId = id;
            document.getElementById('rute-info').innerText = `${stops.find(s=>s.id===connectingFrom).name} ➔ ${stops.find(s=>s.id===id).name}`;
            toggle('modal-rute', true);
        }
    } else {
        activeStopId = id;
        const menu = document.getElementById('stop-menu');
        menu.style.left = `${e.pageX}px`; menu.style.top = `${e.pageY}px`;
        toggle('stop-menu', true);
    }
}

// --- BUTTON ACTIONS ---
document.getElementById('btn-simpan-halte').onclick = () => {
    const name = document.getElementById('input-nama-halte').value;
    if (name) { stops.push({ id: Date.now().toString(), name, ...tempCoord }); save(); toggle('modal-halte', false); }
};

document.getElementById('btn-simpan-rute').onclick = () => {
    const distance = parseFloat(document.getElementById('input-jarak').value);
    const busType = document.getElementById('input-jenis-bus').value;
    if (distance) { routes.push({ from: connectingFrom, to: activeStopId, distance, busType }); save(); toggle('modal-rute', false); isConnecting = false; }
};

document.getElementById('btn-menu-connect').onclick = () => { isConnecting = true; connectingFrom = activeStopId; toggle('stop-menu', false); alert("Klik halte tujuan"); };
document.getElementById('btn-menu-delete').onclick = () => { stops = stops.filter(s => s.id !== activeStopId); routes = routes.filter(r => r.from !== activeStopId && r.to !== activeStopId); save(); toggle('stop-menu', false); };

document.getElementById('btn-cari').onclick = () => {
    const sId = document.getElementById('asal').value, eId = document.getElementById('tujuan').value;
    const res = document.getElementById('hasil-rute');
    const valid = routes.filter(r => (r.from === sId && r.to === eId) || (r.to === sId && r.from === eId));
    
    res.innerHTML = valid.length ? valid.map(r => {
        const b = BUS_TYPES[r.busType];
        return `<div style="border-left:5px solid ${b.color}; background:white; padding:10px; margin-bottom:10px; border-radius:5px; box-shadow:0 2px 5px rgba(0,0,0,0.1)">
            <b>${b.name}</b><br><small>Jarak: ${r.distance}km | Rp${(b.cost * r.distance).toLocaleString()}</small>
        </div>`;
    }).join('') : '<p style="color:red">Rute tidak ditemukan.</p>';
};

function updateSelects() {
    const opts = '<option value="">Pilih Halte...</option>' + stops.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    document.getElementById('asal').innerHTML = opts;
    document.getElementById('tujuan').innerHTML = opts;
    const check = () => document.getElementById('btn-cari').disabled = !document.getElementById('asal').value || !document.getElementById('tujuan').value;
    document.getElementById('asal').onchange = check; document.getElementById('tujuan').onchange = check;
}

window.onclick = () => toggle('stop-menu', false);
initApp();