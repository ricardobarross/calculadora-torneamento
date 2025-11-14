// ====================================================================
// --- 1. CONFIGURAÇÃO E VARIÁVEIS GLOBAIS ---
// ====================================================================

// **ATUALIZE ESTAS DUAS LINHAS COM SUAS CHAVES DO SUPABASE**
const SUPABASE_URL = 'https://ojggxqacgfrshzfdszie.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZ2d4cWFjZ2Zyc2h6ZmRzemllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNjg1MTQsImV4cCI6MjA3ODY0NDUxNH0.FCbYt5dNggwDMFfF-U5F2PptCMql1VO-RMvWjGtcZBc';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let materiaisData = []; // Armazena os dados do Supabase
let chartsReady = false; // Flag para rastrear o carregamento do Google Charts

// ====================================================================
// --- 2. FUNÇÕES DE BUSCA DE DADOS (SUPABASE) ---
// ====================================================================

/**
 * Busca a lista de materiais do Supabase e preenche o dropdown.
 */
async function buscarMateriais() {
    const loadingDiv = document.getElementById('loading');
    const materialSelect = document.getElementById('material');
    
    loadingDiv.classList.add('show');
    materialSelect.disabled = true;

    try {
        const { data, error } = await supabase
            .from('materiais')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;
        
        materiaisData = data;
        
        // Preencher o <select>
        materialSelect.innerHTML = '<option value="">Selecione o Material</option>';
        materiaisData.forEach(material => {
            const option = document.createElement('option');
            option.value = material.key; // Usa a 'key' como valor para facilitar a busca
            option.textContent = material.nome;
            materialSelect.appendChild(option);
        });

    } catch (e) {
        console.error('Erro ao buscar materiais do Supabase:', e.message);
        alert('Erro ao carregar materiais. Verifique a conexão com o banco de dados e as chaves API.');
    } finally {
        loadingDiv.classList.remove('show');
        materialSelect.disabled = false;
    }
}

// ====================================================================
// --- 3. FUNÇÕES DE CÁLCULO E LÓGICA ---
// ====================================================================

/**
 * Realiza todos os cálculos de usinagem.
 * @param {Object} formData - Dados do formulário e do material.
 * @returns {Object} Resultados do cálculo.
 */
function calcularParametros(formData) {
    const { 
        diametro,
        comprimento,
        materialKey,
        operacao,
        modoMaquina,
        profundidadeCorte,
        tempoDesejado
    } = formData;

    const material = materiaisData.find(m => m.key === materialKey);
    if (!material) throw new Error("Material não encontrado.");

    const vc = material.vc_sugerido; // Velocidade de Corte (m/min)
    const fn = material.fn_sugerido; // Avanço por Rotação (mm/rot)
    const ap = profundidadeCorte || 1.0; // Penetração (mm)

    // 1. Rotação (n)
    const rpm = (vc * 1000) / (Math.PI * diametro);
    const n_final = modoMaquina === 'CNC' ? Math.round(rpm) : Math.floor(rpm);

    // 2. Velocidade de Avanço (Vf)
    const vf = n_final * fn; // mm/min

    // 3. Tempo de Usinagem (Tm)
    // O cálculo é feito sobre a distância a ser percorrida (L) / (Vf * k)
    // O comprimento (L) é o que o avanço percorre.
    const L = comprimento; 
    const tm_min = L / vf; // min

    // 4. Produção
    const pecas_por_hora = 60 / tm_min;

    return {
        // Entradas
        ...material,
        diametro: diametro,
        comprimento: comprimento,
        operacao: operacao,
        modoMaquina: modoMaquina,
        
        // Resultados
        vc: vc,
        fn: fn,
        ap: ap,
        rpm: n_final,
        vf: vf,
        tm_min: tm_min,
        pecas_por_hora: pecas_por_hora,
        
        // Desafios e Sugestões (do Supabase)
        desafios: material.desafios,
        grau_iso: material.grau_iso,
        inserto_sug: material.inserto_sug,
        re: material.re
    };
}


// ====================================================================
// --- 4. FUNÇÕES DE INTERFACE (DISPLAY) ---
// ====================================================================

/**
 * Desenha o gráfico de produção.
 * @param {Object} dados - Resultados do cálculo.
 */
function drawChart(dados) {
    const data = google.visualization.arrayToDataTable([
        ['Métrica', 'Valor'],
        ['Rotação (n)', dados.rpm],
        ['Vf (mm/min)', dados.vf],
        ['Tm (min)', dados.tm_min],
        ['Peças/Hora', dados.pecas_por_hora]
    ]);

    const options = {
        title: 'Resumo de Produção e Parâmetros',
        vAxis: { title: 'Valores Calculados' },
        legend: { position: 'none' },
        chartArea: { width: '80%', height: '70%' }
    };

    const chart = new google.visualization.ColumnChart(document.getElementById('chart_div'));
    chart.draw(data, options);
}


/**
 * Exibe os resultados no HTML e desenha o gráfico.
 * @param {Object} dados - Resultados do cálculo.
 * @param {string} modoMaquina - CNC ou Convencional.
 */
function mostrarResultados(dados, modoMaquina) {
    document.getElementById('loading').classList.remove('show');
    
    const resultsDiv = document.getElementById('results');
    
    // --- 1. CONSTRUÇÃO DO HTML DE RESULTADOS ---
    // (O seu HTML de resultados, mantido aqui por concisão)
    let htmlResults = `
        <h3>📊 Resumo dos Parâmetros Calculados (${dados.operacao})</h3>
        <div class="result-item">
            <span class="result-label">Modo de Máquina:</span>
            <span class="result-value" style="color:#764ba2;">${modoMaquina}</span>
        </div>
        <div class="result-item">
            <span class="result-label">Velocidade de Corte (Vc):</span>
            <span class="result-value">${dados.vc} m/min</span>
        </div>
        <div class="result-item">
            <span class="result-label">Rotação Sugerida (n):</span>
            <span class="result-value">${dados.rpm} rpm</span>
        </div>
        <div class="result-item">
            <span class="result-label">Avanço por Rotação (f_n):</span>
            <span class="result-value">${dados.fn.toFixed(3)} mm/rot</span>
        </div>
        <div class="result-item">
            <span class="result-label">Penetração (a_p):</span>
            <span class="result-value">${dados.ap.toFixed(1)} mm</span>
        </div>
        <div class="result-item" style="background-color:#e6ffe6; border-radius:5px;">
            <span class="result-label" style="font-weight:700; color:#2d3748;">Tempo de Usinagem (T_m):</span>
            <span class="result-value" style="color:#008000;">${dados.tm_min.toFixed(2)} min</span>
        </div>
        <div class="result-item">
            <span class="result-label">Velocidade de Avanço (V_f):</span>
            <span class="result-value">${dados.vf.toFixed(0)} mm/min</span>
        </div>
        <div class="result-item" style="border-top: 1px dashed #ccc; margin-top: 10px; padding-top: 10px;">
            <span class="result-label" style="font-weight:700;">Peças por Hora (Estimativa):</span>
            <span class="result-value">${dados.pecas_por_hora.toFixed(2)}</span>
        </div>

        <div class="material-info">
            <h4>Recomendação de Ferramenta (${dados.operacao}):</h4>
            <p>Material: **${dados.nome}**</p>
            <p>Grupo ISO: **${dados.grupo}** | Grau/Revestimento Sugerido: **${dados.grau_iso}**</p>
            <p>Inserto Sugerido (Geometria): **${dados.inserto_sug}** | Raio de Ponta (RE): **${dados.re} mm**</p>
        </div>

        <div class="nota-desafio">
            <h4>⚠️ Nota de Cuidado: Desafios na Máquinação</h4>
            <p>${dados.desafios}</p>
        </div>
        
        <h3>📈 Gráfico de Resumo de Produção</h3>
        <div id="chart_div" style="width: 100%; height: 300px; margin-top: 15px;"></div>
    `;
    
    resultsDiv.innerHTML = htmlResults;

    // --- 2. DESENHAR GRÁFICO (CHAMADA CORRIGIDA) ---
    // Chama a função drawChart. Como a lib já foi carregada na inicialização,
    // esta chamada deve funcionar.
    if (chartsReady) {
        drawChart(dados);
    } else {
        // Em um caso de erro, força o callback para tentar desenhar.
        google.charts.setOnLoadCallback(() => drawChart(dados));
    }

    // Mostrar resultados
    resultsDiv.classList.add('show');
}

// ====================================================================
// --- 5. LÓGICA DE SUBMISSÃO DO FORMULÁRIO ---
// ====================================================================

document.getElementById('calcForm').addEventListener('submit', function(e) {
    e.preventDefault();
    document.getElementById('loading').classList.add('show');
    document.getElementById('results').classList.remove('show');

    try {
        const materialKey = document.getElementById('material').value;
        if (!materialKey) {
            alert("Selecione um material para calcular.");
            document.getElementById('loading').classList.remove('show');
            return;
        }

        const formData = {
            diametro: parseFloat(document.getElementById('diametro').value),
            comprimento: parseFloat(document.getElementById('comprimento').value),
            profundidadeCorte: parseFloat(document.getElementById('ap').value) || null,
            operacao: document.getElementById('operacao').value,
            modoMaquina: document.getElementById('modoMaquina').value,
            materialKey: materialKey
            // tempoDesejado: parseFloat(document.getElementById('tempoDesejado').value) || null
        };
        
        const resultados = calcularParametros(formData);
        mostrarResultados(resultados, formData.modoMaquina);

    } catch (error) {
        console.error("Erro durante o cálculo:", error);
        alert(`Erro durante o cálculo: ${error.message}`);
        document.getElementById('loading').classList.remove('show');
    }
});


// ====================================================================
// --- 6. INICIALIZAÇÃO E CARREGAMENTO DE LIBS (GARANTIA DE ORDEM) ---
// ====================================================================

// 1. Inicia o processo de carregamento dos pacotes do Google Charts.
// Se a tag <script> com o loader.js estiver no index.html, esta linha já está OK.
google.charts.load('current', {'packages':['corechart', 'bar']});

// 2. Define o callback para quando o Google Charts estiver pronto.
google.charts.setOnLoadCallback(function() {
    console.log("Google Charts: Lib carregada e pronta.");
    chartsReady = true; // Seta a flag para true
});

// 3. Inicia a busca por materiais ao carregar a página
document.addEventListener('DOMContentLoaded', buscarMateriais);