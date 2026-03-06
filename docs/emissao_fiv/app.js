'use strict';

/* ══════════════════════════════════════════════════════════
   Ficha de Inspeção Veicular (FIV) — PW Leilões
   ══════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// Template .docx em memória
// ─────────────────────────────────────────────
let templateBuffer = null;

const elIcon   = document.getElementById('templateStatusIcon');
const elText   = document.getElementById('templateStatusText');
const elUpload = document.getElementById('templateUpload');
const elZone   = document.getElementById('templateDropZone');
const elInput  = document.getElementById('templateFileInput');
const elInfo   = document.getElementById('templateFileInfo');
const elClear  = document.getElementById('templateClearFile');

function setStatusOk(msg) {
  elIcon.className = 'status-icon ok';
  elIcon.textContent = '✓';
  elText.textContent = msg;
}
function setStatusErr(msg) {
  elIcon.className = 'status-icon err';
  elIcon.textContent = '!';
  elText.textContent = msg;
  elUpload.classList.remove('hidden');
}

async function tryAutoLoad() {
  try {
    const resp = await fetch('../modelo_laudo/MODELO - LAUDO.docx');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    templateBuffer = await resp.arrayBuffer();
    setStatusOk('Modelo da FIV carregado automaticamente.');
  } catch {
    setStatusErr('Não foi possível carregar o modelo automaticamente. Selecione o arquivo abaixo.');
  }
}

elInput.addEventListener('change', () => {
  if (elInput.files[0]) loadTemplateFile(elInput.files[0]);
});
elZone.addEventListener('dragover', e => { e.preventDefault(); elZone.classList.add('drag'); });
elZone.addEventListener('dragleave', ()  => elZone.classList.remove('drag'));
elZone.addEventListener('drop', e => {
  e.preventDefault(); elZone.classList.remove('drag');
  if (e.dataTransfer.files[0]) loadTemplateFile(e.dataTransfer.files[0]);
});

function loadTemplateFile(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    templateBuffer = ev.target.result;
    setStatusOk(`Modelo carregado: ${file.name}`);
    elZone.classList.add('hidden');
    document.getElementById('templateFileInfo').classList.remove('hidden');
    document.getElementById('templateFileName').textContent = file.name;
    document.getElementById('templateFileMeta').textContent = `${(file.size/1024).toFixed(1)} KB`;
  };
  reader.readAsArrayBuffer(file);
}

elClear.addEventListener('click', () => {
  templateBuffer = null;
  elInput.value = '';
  elZone.classList.remove('hidden');
  elInfo.classList.add('hidden');
  setStatusErr('Selecione o arquivo modelo (.docx) abaixo.');
});

// ─────────────────────────────────────────────
// Gerenciamento de veículos
// ─────────────────────────────────────────────
let vidCounter = 0;

function addVehicle() {
  vidCounter++;
  const vid = vidCounter;

  const card = document.createElement('div');
  card.className = 'vehicle-card';
  card.id = `vehicle-${vid}`;
  card.dataset.vid = String(vid);
  card.innerHTML = vehicleCardHTML(vid);
  document.getElementById('vehiclesList').prepend(card);

  // Data padrão = hoje
  const dateInput = document.getElementById(`data-${vid}`);
  if (dateInput) dateInput.value = localDateISO();

  updateVehicleNumbers();
  updateGenerateBtn();
}

function removeVehicle(vid) {
  const cards = document.querySelectorAll('.vehicle-card');
  if (cards.length <= 1) {
    showToast('error', '⚠', 'É necessário manter pelo menos um veículo.');
    return;
  }
  document.getElementById(`vehicle-${vid}`).remove();
  updateVehicleNumbers();
  updateGenerateBtn();
}

// Retorna a data local no formato YYYY-MM-DD (sem depender de UTC)
function localDateISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Monta o nome do arquivo: usa PLACA, senão CHASSI, senão fallback
function fivFilename(data, fallback) {
  const id = data.PLACA || data.CHASSI || fallback;
  return `FIV - ${id}.docx`;
}

// Download individual de um único veículo
async function downloadVehicle(vid) {
  if (!templateBuffer) {
    showToast('error', '⚠', 'Carregue o modelo (.docx) antes de gerar a FIV.');
    elUpload.classList.remove('hidden');
    return;
  }
  try {
    const data     = { ...collectCommonData(), ...collectVehicleData(vid) };
    const blob     = generateDocx(data);
    const filename = fivFilename(data, `veiculo${vid}`);
    if (await downloadBlob(blob, filename))
      showToast('success', '✓', `FIV salva: ${filename}`);
  } catch (err) {
    console.error('[FIV] downloadVehicle:', err);
    showToast('error', '⚠', `Erro ao gerar a FIV: ${err.message}`);
  }
}

function toggleVehicle(vid) {
  const body   = document.getElementById(`vbody-${vid}`);
  const arrow  = document.getElementById(`varrow-${vid}`);
  const isCollapsed = body.classList.contains('collapsed');
  body.classList.toggle('collapsed', !isCollapsed);
  arrow.classList.toggle('collapsed', !isCollapsed);
}

function updateVehicleLabel(vid) {
  const placa = (document.getElementById(`placa-${vid}`) || {}).value || '';
  const label = document.getElementById(`vlabel-${vid}`);
  if (label) label.textContent = placa.toUpperCase() || 'Novo Veículo';
}

function updateVehicleNumbers() {
  const cards = document.querySelectorAll('.vehicle-card');
  // Usa o vid como número fixo — não muda com a posição na tela
  cards.forEach(card => {
    const numEl = card.querySelector('.vehicle-number');
    if (numEl) numEl.textContent = `#${card.dataset.vid}`;
  });
  document.getElementById('vehicleCountBadge').textContent = cards.length;
}

function updateGenerateBtn() {
  const count = document.querySelectorAll('.vehicle-card').length;
  const label = count <= 1
    ? '↓ &nbsp;Gerar FIV'
    : `↓ &nbsp;Gerar ${count} FIVs (ZIP)`;
  document.getElementById('generateBtn').innerHTML    = label;
  document.getElementById('generateBtnTop').innerHTML = label;
}

// ─────────────────────────────────────────────
// HTML de um cartão de veículo (gerado dinamicamente)
// ─────────────────────────────────────────────
function vehicleCardHTML(vid) {
  const components = [
    ['Parachoque Dianteiro', 'PDA', 'PDF', 'PDO'],
    ['Parachoque Traseiro',  'PTA', 'PTF', 'PTO'],
    ['Bancos Dianteiros',    'BDA', 'BDF', 'BDO'],
    ['Bancos Traseiros',     'BTA', 'BTF', 'BTO'],
    ['Faróis',               'FA',  'FF',  'FO' ],
    ['Lanternas',            'LA',  'LF',  'LO' ],
    ['Motor',                'MA',  'MF',  'MO' ],
    ['Lataria',              'LATA','LATF','LATO'],
    ['Pintura',              'PA',  'PF',  'PO' ],
    ['Painel de Instrumentos','PIA','PIF', 'PIO'],
    ['Caixa de Marcha',      'CMA', 'CMF', 'CMO'],
    ['Capô',                 'CA',  'CF',  'CO' ],
  ];

  const pneus = [
    ['Dianteiro Direito',  'pneuDD', 'DDF','DDB','DDR'],
    ['Dianteiro Esquerdo', 'pneuDE', 'DEF','DEB','DER'],
    ['Traseiro Direito',   'pneuTD', 'TDF','TDB','TDR'],
    ['Traseiro Esquerdo',  'pneuTE', 'TEF','TEB','TER'],
  ];

  const rodas = [
    ['Dianteiro Direito',  'rodaDD', 'RDDF','RDDP'],
    ['Dianteiro Esquerdo', 'rodaDE', 'RDEF','RDEP'],
    ['Traseiro Direito',   'rodaTD', 'RTDF','RTDP'],
    ['Traseiro Esquerdo',  'rodaTE', 'RTEF','RTEP'],
  ];

  return `
    <!-- Cabeçalho do cartão -->
    <div class="vehicle-card-header" onclick="toggleVehicle(${vid})">
      <div class="vehicle-card-title">
        <span class="vehicle-number">#${vid}</span>
        <span class="vehicle-label" id="vlabel-${vid}">Novo Veículo</span>
      </div>
      <div class="vehicle-card-actions" onclick="event.stopPropagation()">
        <button class="btn primary mini" onclick="downloadVehicle(${vid})" title="Baixar esta FIV">↓ Baixar</button>
        <span class="toggle-arrow" id="varrow-${vid}">▲</span>
        <button class="btn ghost mini" onclick="removeVehicle(${vid})" title="Remover veículo">×</button>
      </div>
    </div>

    <!-- Corpo do cartão -->
    <div class="vehicle-card-body" id="vbody-${vid}">

      <!-- Dados do veículo -->
      <div class="vc-section">
        <p class="vc-section-title">Dados do Veículo</p>
        <div class="fields-grid">
          <div class="field w2">
            <label>Pátio Origem</label>
            <input type="text" id="patio-${vid}" placeholder="Nome do pátio" />
          </div>
          <div class="field">
            <label>Data de Inspeção</label>
            <input type="date" id="data-${vid}" />
          </div>
          <div class="field w2">
            <label>Chassi</label>
            <input type="text" id="chassi-${vid}" placeholder="9BWZZZ..." style="text-transform:uppercase" />
          </div>
          <div class="field">
            <label>RENAVAM</label>
            <input type="text" id="renavam-${vid}" placeholder="00000000000" />
          </div>
          <div class="field">
            <label>Marca</label>
            <input type="text" id="marca-${vid}" placeholder="Ex: Volkswagen" />
          </div>
          <div class="field">
            <label>Modelo</label>
            <input type="text" id="modelo-${vid}" placeholder="Ex: Gol" />
          </div>
          <div class="field">
            <label>Tipo</label>
            <input type="text" id="tipo-${vid}" placeholder="Ex: Hatch" />
          </div>
          <div class="field">
            <label>Combustível</label>
            <input type="text" id="combustivel-${vid}" placeholder="Ex: Flex" />
          </div>
          <div class="field">
            <label>Ano Fabricação</label>
            <input type="number" id="anofab-${vid}" placeholder="AAAA" min="1900" max="2099" />
          </div>
          <div class="field">
            <label>Ano Modelo</label>
            <input type="number" id="anomod-${vid}" placeholder="AAAA" min="1900" max="2099" />
          </div>
          <div class="field">
            <label>Cor</label>
            <input type="text" id="cor-${vid}" placeholder="Ex: Prata" />
          </div>
          <div class="field">
            <label>Placa</label>
            <input type="text" id="placa-${vid}" placeholder="ABC-1234"
                   style="text-transform:uppercase"
                   oninput="updateVehicleLabel(${vid})" />
          </div>
        </div>
      </div>

      <!-- Estado Geral -->
      <div class="vc-section">
        <p class="vc-section-title">Estado Geral do Veículo
          <span class="vc-hint">(marcar somente uma opção)</span>
        </p>
        <div class="radio-grid">
          ${[['OTIMO','Ótimo'],['BOM','Bom'],['REGULAR','Regular'],['SUCATA','Sucata']].map(([val, label]) => `
            <label class="radio-option">
              <input type="radio" name="estadoGeral-${vid}" value="${val}" />
              <span class="radio-dot"></span><span>${label}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <!-- Condição de Locomoção -->
      <div class="vc-section">
        <p class="vc-section-title">Condição de Locomoção
          <span class="vc-hint">(marcar somente uma opção)</span>
        </p>
        <div class="radio-grid">
          <label class="radio-option">
            <input type="radio" name="condLoc-${vid}" value="CLSIM" />
            <span class="radio-dot"></span><span>Possui condição de locomoção</span>
          </label>
          <label class="radio-option">
            <input type="radio" name="condLoc-${vid}" value="CLNAO" />
            <span class="radio-dot"></span><span>Não possui condição de locomoção</span>
          </label>
        </div>
      </div>

      <!-- Componentes -->
      <div class="vc-section">
        <p class="vc-section-title">Componentes
          <span class="vc-hint">(pode marcar mais de uma opção por item)</span>
        </p>
        <div class="comp-table">
          <div class="comp-row comp-header">
            <div class="comp-cell col-item">Item</div>
            <div class="comp-cell">Avariado</div>
            <div class="comp-cell">Faltando</div>
            <div class="comp-cell">OK</div>
          </div>
          ${components.map(([name, ka, kb, kc]) => `
            <div class="comp-row">
              <div class="comp-cell col-item">${name}</div>
              <label class="comp-cell"><input type="checkbox" class="comp-check" id="${ka}-${vid}" /></label>
              <label class="comp-cell"><input type="checkbox" class="comp-check" id="${kb}-${vid}" /></label>
              <label class="comp-cell"><input type="checkbox" class="comp-check" id="${kc}-${vid}" /></label>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Pneus -->
      <div class="vc-section">
        <p class="vc-section-title">Pneus
          <span class="vc-hint">(marcar somente uma opção por posição)</span>
        </p>
        <div class="wheels-grid">
          ${pneus.map(([pos, grp, k1, k2, k3]) => `
            <div class="wheel-card">
              <h4>${pos}</h4>
              <div class="wheel-options">
                <label class="wheel-option"><input type="radio" name="${grp}-${vid}" value="${k1}" /><span class="wheel-radio"></span><span>Falta</span></label>
                <label class="wheel-option"><input type="radio" name="${grp}-${vid}" value="${k2}" /><span class="wheel-radio"></span><span>Bom</span></label>
                <label class="wheel-option"><input type="radio" name="${grp}-${vid}" value="${k3}" /><span class="wheel-radio"></span><span>Ruim</span></label>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Rodas -->
      <div class="vc-section">
        <p class="vc-section-title">Rodas
          <span class="vc-hint">(marcar somente uma opção por posição)</span>
        </p>
        <div class="wheels-grid">
          ${rodas.map(([pos, grp, k1, k2]) => `
            <div class="wheel-card">
              <h4>${pos}</h4>
              <div class="wheel-options">
                <label class="wheel-option"><input type="radio" name="${grp}-${vid}" value="${k1}" /><span class="wheel-radio"></span><span>Falta</span></label>
                <label class="wheel-option"><input type="radio" name="${grp}-${vid}" value="${k2}" /><span class="wheel-radio"></span><span>Possui</span></label>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

    </div><!-- /vehicle-card-body -->
  `;
}

// ─────────────────────────────────────────────
// Coleta de dados
// ─────────────────────────────────────────────
function collectCommonData() {
  const val = id => (document.getElementById(id) || {}).value || '';
  return {
    COMITENTE: val('comitente').toUpperCase(),
    CIDADE:    val('cidade').toUpperCase(),
    UF:        val('uf').toUpperCase(),
  };
}

function collectVehicleData(vid) {
  const val = id => (document.getElementById(id) || {}).value || '';

  const data = {
    PATIO:        val(`patio-${vid}`).toUpperCase(),
    CHASSI:       val(`chassi-${vid}`).toUpperCase(),
    RENAVAM:      val(`renavam-${vid}`),
    MARCA:        val(`marca-${vid}`).toUpperCase(),
    MODELO:       val(`modelo-${vid}`).toUpperCase(),
    TIPO:         val(`tipo-${vid}`).toUpperCase(),
    'COMBUSTIVÉL': val(`combustivel-${vid}`).toUpperCase(),
    ANOFAB:       val(`anofab-${vid}`),
    ANOMOD:       val(`anomod-${vid}`),
    COR:          val(`cor-${vid}`).toUpperCase(),
    PLACA:        val(`placa-${vid}`).toUpperCase(),
  };

  // Data de inspeção
  const rawDate = val(`data-${vid}`);
  if (rawDate) {
    const [y, m, d] = rawDate.split('-');
    data.DATA = `${d}/${m}/${y}`;
  } else {
    data.DATA = '';
  }

  // Estado Geral
  const estadoSel = document.querySelector(`input[name="estadoGeral-${vid}"]:checked`);
  ['OTIMO','BOM','REGULAR','SUCATA'].forEach(k => {
    data[k] = estadoSel?.value === k ? 'X' : '';
  });

  // Condição de Locomoção
  const condLocSel = document.querySelector(`input[name="condLoc-${vid}"]:checked`);
  ['CLSIM','CLNAO'].forEach(k => {
    data[k] = condLocSel?.value === k ? 'X' : '';
  });

  // Componentes (checkboxes)
  ['PDA','PDF','PDO','PTA','PTF','PTO','BDA','BDF','BDO','BTA','BTF','BTO',
   'FA','FF','FO','LA','LF','LO','MA','MF','MO','LATA','LATF','LATO',
   'PA','PF','PO','PIA','PIF','PIO','CMA','CMF','CMO','CA','CF','CO']
    .forEach(k => {
      const el = document.getElementById(`${k}-${vid}`);
      data[k] = el?.checked ? 'X' : '';
    });

  // Pneus
  [{ name:`pneuDD-${vid}`, keys:['DDF','DDB','DDR'] },
   { name:`pneuDE-${vid}`, keys:['DEF','DEB','DER'] },
   { name:`pneuTD-${vid}`, keys:['TDF','TDB','TDR'] },
   { name:`pneuTE-${vid}`, keys:['TEF','TEB','TER'] }]
    .forEach(({ name, keys }) => {
      const sel = document.querySelector(`input[name="${name}"]:checked`);
      keys.forEach(k => { data[k] = sel?.value === k ? 'X' : ''; });
    });

  // Rodas
  [{ name:`rodaDD-${vid}`, keys:['RDDF','RDDP'] },
   { name:`rodaDE-${vid}`, keys:['RDEF','RDEP'] },
   { name:`rodaTD-${vid}`, keys:['RTDF','RTDP'] },
   { name:`rodaTE-${vid}`, keys:['RTEF','RTEP'] }]
    .forEach(({ name, keys }) => {
      const sel = document.querySelector(`input[name="${name}"]:checked`);
      keys.forEach(k => { data[k] = sel?.value === k ? 'X' : ''; });
    });

  return data;
}

// ─────────────────────────────────────────────
// Pós-processamento: remove parágrafos extras em células com "X"
// ─────────────────────────────────────────────
function postProcessXCentering(zip) {
  let xml = zip.files['word/document.xml'].asText();

  // Extrai o texto de um bloco XML (apenas conteúdo de <w:t>...)
  const extractText = block => {
    const matches = block.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    return matches.map(m => m.replace(/<[^>]+>/g, '')).join('').trim();
  };

  // Divide o XML em células <w:tc>...</w:tc>
  xml = xml.replace(/(<w:tc>)([\s\S]*?)(<\/w:tc>)/g, (_, open, body, close) => {
    // Separa os parágrafos dentro da célula
    const parts = [];
    const re = /(<w:p[ >][\s\S]*?<\/w:p>)/g;
    let m;
    while ((m = re.exec(body)) !== null) parts.push(m[1]);

    // Verifica se algum parágrafo tem apenas "X"
    const xIdx = parts.findIndex(p => extractText(p) === 'X');
    if (xIdx === -1) return open + body + close;

    // Remove todos os parágrafos sem texto (exceto o X)
    const cleaned = parts.filter((p, i) => {
      if (i === xIdx) return true;
      return extractText(p) !== '';
    });

    // Reconstrói a célula substituindo apenas os parágrafos
    const newBody = body.replace(/(<w:p[ >][\s\S]*?<\/w:p>[\s]*)+/, cleaned.join(''));
    return open + newBody + close;
  });

  zip.file('word/document.xml', xml);
}

// ─────────────────────────────────────────────
// Geração do .docx para um conjunto de dados
// ─────────────────────────────────────────────
function generateDocx(data) {
  const zip = new PizZip(templateBuffer.slice(0));
  const doc = new window.docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(data);
  postProcessXCentering(doc.getZip());
  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

// Retorna true se salvo, false se cancelado pelo usuário
async function downloadBlob(blob, filename) {
  const ext = filename.split('.').pop().toLowerCase();

  // Chrome / Edge — abre o diálogo nativo "Salvar como"
  if (window.showSaveFilePicker) {
    const types = ext === 'zip'
      ? [{ description: 'Arquivo ZIP', accept: { 'application/zip': ['.zip'] } }]
      : [{ description: 'Documento Word', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } }];
    try {
      const handle   = await window.showSaveFilePicker({ suggestedName: filename, types });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false; // usuário cancelou
      console.warn('[FIV] showSaveFilePicker falhou, usando fallback:', err);
      // continua para o fallback abaixo
    }
  }

  // Fallback (Firefox, Safari, arquivo:// …)
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

// ─────────────────────────────────────────────
// Botão Gerar
// ─────────────────────────────────────────────
document.getElementById('generateBtn').addEventListener('click', async () => {
  if (!templateBuffer) {
    showToast('error', '⚠', 'Carregue o modelo (.docx) antes de gerar a FIV.');
    elUpload.classList.remove('hidden');
    elUpload.scrollIntoView({ behavior:'smooth', block:'center' });
    return;
  }

  const cards = [...document.querySelectorAll('.vehicle-card')];
  if (cards.length === 0) {
    showToast('error', '⚠', 'Adicione pelo menos um veículo.');
    return;
  }

  const btn         = document.getElementById('generateBtn');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;

  const commonData = collectCommonData();
  const today      = localDateISO();

  try {
    if (cards.length === 1) {
      // ─ Um único veículo → download direto ─
      btn.textContent = 'Gerando…';
      const vid  = cards[0].dataset.vid;
      const data = { ...commonData, ...collectVehicleData(vid) };
      const blob     = generateDocx(data);
      const filename = fivFilename(data, 'veiculo');
      if (await downloadBlob(blob, filename))
        showToast('success', '✓', `FIV salva: ${filename}`);

    } else {
      // ─ Múltiplos veículos → ZIP ─
      const jzip = new JSZip();
      let success = 0, errors = 0;

      for (let i = 0; i < cards.length; i++) {
        btn.textContent = `Gerando ${i + 1} / ${cards.length}…`;
        const vid  = cards[i].dataset.vid;
        const data = { ...commonData, ...collectVehicleData(vid) };
        try {
          const blob     = generateDocx(data);
          const filename = fivFilename(data, `veiculo${i + 1}`);
          jzip.file(filename, blob);
          success++;
        } catch (err) {
          errors++;
          console.error(`[FIV] Erro no veículo #${i + 1}:`, err);
        }
      }

      btn.textContent = 'Comprimindo…';
      const zipBlob = await jzip.generateAsync({ type: 'blob' });
      const zipName = `FIVs_${today}.zip`;
      if (await downloadBlob(zipBlob, zipName)) {
        const errMsg = errors ? ` (${errors} com erro)` : '';
        showToast('success', '✓', `${success} FIV(s) salva(s) em ZIP${errMsg}`);
      }
    }

  } catch (err) {
    console.error('[FIV] Erro geral:', err);
    let msg = err.message || 'Erro desconhecido';
    if (err.properties?.errors?.length) {
      msg = err.properties.errors.map(e => e.message).join(' | ');
    }
    showToast('error', '⚠', `Erro ao gerar a FIV: ${msg}`);

  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
});

// ─────────────────────────────────────────────
// Botões de ação
// ─────────────────────────────────────────────
document.getElementById('addVehicleBtn').addEventListener('click', addVehicle);

// Botão gerar do topo dispara o mesmo clique do rodapé
document.getElementById('generateBtnTop').addEventListener('click', () => {
  document.getElementById('generateBtn').click();
});

// ─────────────────────────────────────────────
// Persistência 24h (localStorage)
// ─────────────────────────────────────────────
const _LS_KEY = 'fiv_state_v1';
const _TTL_MS = 24 * 60 * 60 * 1000;
let   _saveTimer = null;

function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveState, 800);
}

function collectState() {
  const val = id => (document.getElementById(id) || {}).value || '';
  const checkKeys = ['PDA','PDF','PDO','PTA','PTF','PTO','BDA','BDF','BDO','BTA','BTF','BTO',
    'FA','FF','FO','LA','LF','LO','MA','MF','MO','LATA','LATF','LATO',
    'PA','PF','PO','PIA','PIF','PIO','CMA','CMF','CMO','CA','CF','CO'];
  const radioNames = ['estadoGeral','condLoc','pneuDD','pneuDE','pneuTD','pneuTE','rodaDD','rodaDE','rodaTD','rodaTE'];
  const textFields = ['patio','chassi','renavam','marca','modelo','tipo','combustivel','anofab','anomod','cor','placa','data'];

  const vehicles = [...document.querySelectorAll('.vehicle-card')].map(card => {
    const vid = card.dataset.vid;
    const v = { vid };
    textFields.forEach(f => { v[f] = val(`${f}-${vid}`); });
    radioNames.forEach(name => {
      const sel = document.querySelector(`input[name="${name}-${vid}"]:checked`);
      v[name] = sel ? sel.value : '';
    });
    v.checkboxes = checkKeys.filter(k => (document.getElementById(`${k}-${vid}`) || {}).checked);
    return v;
  });

  return { ts: Date.now(), comitente: val('comitente'), cidade: val('cidade'), uf: val('uf'), vehicles };
}

function saveState() {
  try { localStorage.setItem(_LS_KEY, JSON.stringify(collectState())); } catch (_) {}
}

async function restoreState() {
  try {
    const raw = localStorage.getItem(_LS_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved?.ts || Date.now() - saved.ts > _TTL_MS) { localStorage.removeItem(_LS_KEY); return false; }

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('comitente', saved.comitente);
    setVal('cidade', saved.cidade);
    setVal('uf', saved.uf);

    document.getElementById('vehiclesList').innerHTML = '';
    vidCounter = 0;

    // Restaura na ordem inversa (addVehicle prepend → último fica no topo)
    for (const v of [...(saved.vehicles || [])].reverse()) {
      addVehicle();
      const vid = vidCounter;
      ['patio','chassi','renavam','marca','modelo','tipo','combustivel','anofab','anomod','cor','placa','data']
        .forEach(f => setVal(`${f}-${vid}`, v[f]));
      ['estadoGeral','condLoc','pneuDD','pneuDE','pneuTD','pneuTE','rodaDD','rodaDE','rodaTD','rodaTE']
        .forEach(name => {
          if (v[name]) { const el = document.querySelector(`input[name="${name}-${vid}"][value="${v[name]}"]`); if (el) el.checked = true; }
        });
      (v.checkboxes || []).forEach(k => { const el = document.getElementById(`${k}-${vid}`); if (el) el.checked = true; });
      updateVehicleLabel(vid);
    }

    updateVehicleNumbers();
    updateGenerateBtn();
    showToast('success', '✓', 'Sessão anterior restaurada (dados salvos por 24h).');
    return true;
  } catch (_) { return false; }
}

// Auto-save em qualquer interação com o formulário
document.addEventListener('input',  scheduleSave);
document.addEventListener('change', scheduleSave);

// ─────────────────────────────────────────────
// Modal de confirmação
// ─────────────────────────────────────────────
function showConfirm(msg) {
  return new Promise(resolve => {
    const modal  = document.getElementById('confirmModal');
    const msgEl  = document.getElementById('confirmModalMsg');
    const okBtn  = document.getElementById('confirmModalOk');
    const cancel = document.getElementById('confirmModalCancel');
    msgEl.textContent = msg;
    modal.classList.remove('hidden');
    function close(result) {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk()     { close(true);  }
    function onCancel() { close(false); }
    okBtn.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
  });
}

// ─────────────────────────────────────────────
// Botão Novo Projeto
// ─────────────────────────────────────────────
document.getElementById('clearAllBtn').addEventListener('click', async () => {
  const ok = await showConfirm('Iniciar novo projeto vai apagar todos os dados atuais.\n\nDeseja continuar?');
  if (!ok) return;
  localStorage.removeItem(_LS_KEY);
  ['comitente','cidade','uf'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('vehiclesList').innerHTML = '';
  vidCounter = 0;
  addVehicle();
});

// ─────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────
let toastTimer = null;
function showToast(type, icon, text) {
  const toast = document.getElementById('toast');
  document.getElementById('toastIcon').textContent = icon;
  document.getElementById('toastText').textContent = text;
  toast.className = `toast ${type} visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 5000);
}

// ─────────────────────────────────────────────
// Inicialização
// ─────────────────────────────────────────────
tryAutoLoad();
restoreState().then(restored => { if (!restored) addVehicle(); });
