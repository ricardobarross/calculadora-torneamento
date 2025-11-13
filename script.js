// ====================================================================
// --- 1. CONFIGURAÇÃO SUPABASE ---
// ** IMPORTANTE: Preencha com suas credenciais do projeto Supabase **
// ====================================================================

const SUPABASE_URL = 'https://ojggxqacgfrshzfdszie.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZ2d4cWFjZ2Zyc2h6ZmRzemllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNjg1MTQsImV4cCI6MjA3ODY0NDUxNH0.FCbYt5dNggwDMFfF-U5F2PptCMql1VO-RMvWjGtcZBc'; // Chave pública (Anon Key)

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cache para armazenar os dados dos materiais carregados do BD
let materiaisCache = {};

// ====================================================================
// --- 2. FUNÇÕES DE BUSCA DE DADOS ---
// ====================================================================

/**
 * Busca todos os materiais da tabela Supabase e armazena no cache.
 */
async function buscarMateriais() {
    try {
        const { data, error } = await supabase
            .from('materiais') // Nome da tabela
            .select('*')
            .order('grupo_iso', { ascending: true })
            .order('nome', { ascending: true });

        if (error) throw error;

        // Organiza os dados em cache no formato {chave_material: objeto_completo}
        data.forEach(mat => {
            materiaisCache[mat.chave_material] = mat;
        });

        carregarOpcoesMateriais(data);

    } catch (error) {
        console.error('Erro ao buscar materiais do Supabase:', error.message);
        alert('Erro ao conectar ao banco de dados: ' + error.message);
        document.getElementById('material').innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

/**
 * Preenche o <select> de materiais no HTML, agrupando-os.
 * @param {Array} data - Lista de materiais.
 */
function carregarOpcoesMateriais(data) {
    const select = document.getElementById('material');
    select.innerHTML = '<option value="">Selecione o material...</option>';
    
    // Organizar por grupo ISO
    const grupos = {};
    data.forEach(mat => {
        if (!grupos[mat.grupo_iso]) {
            grupos[mat.grupo_iso] = [];
        }
        grupos[mat.grupo_iso].push(mat);
    });
    
    // Criar optgroups no HTML
    for (let grupo in grupos) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = grupo; 
        
        grupos[grupo].forEach(mat => {
            const option = document.createElement('option');
            option.value = mat.chave_material;
            option.textContent = mat.nome;
            optgroup.appendChild(option);
        });
        
        select.appendChild(optgroup);
    }
}

// ====================================================================
// --- 3. LÓGICA DE CÁLCULO (Adaptada do Code.gs) ---
// ====================================================================

/**
 * Executa os cálculos cinemáticos e de produção.
 * @param {Object} mat - Objeto material completo do Supabase.
 * @param {number} diametro - Diâmetro da peça.
 * @param {string} operacao - 'Desbaste' ou 'Acabamento'.
 * @param {number} comprimento - Comprimento a usinar.
 * @returns {Object} Resultados calculados.
 */
function calcularParametros(mat, diametro, operacao, comprimento) {
    
    // 1. Vc: Desbaste = Média, Acabamento = Máxima.
    const vc = operacao === "Desbaste" 
        ? Math.round((mat.vc_min + mat.vc_max) / 2)
        : mat.vc_max;
    
    // 2. RPM (n)
    // Fórmula: n = (1000 * Vc) / (pi * D)
    const rpm_calc = Math.round((1000 * vc) / (Math.PI * diametro));
    
    // 3. fn: Desbaste = MÁXIMO, Acabamento = MÍNIMO.
    const fn_value = operacao === "Desbaste"
        ? mat.fn_desb_max
        : mat.fn_acab_min; 
    const fn = fn_value; 
    
    // 4. ap: Desbaste ~ 3x Re, Acabamento ~ 0.8x Re.
    const ap = operacao === "Desbaste"
        ? (mat.re * 3.0).toFixed(1)
        : (mat.re * 0.8).toFixed(1);

    const rpm_final = rpm_calc; // Mantemos o RPM ideal

    // 5. Vf e Tm
    const Vf_calculado = fn * rpm_final;
    const Vf_final = Math.min(Vf_calculado, mat.vf_max); // Limita pelo avanço máximo da máquina (Vf_max)
    const Tm_min = (comprimento / Vf_final); // Tempo em minutos

    // Sugestão de Inserto
    const inserto_sug = operacao === "Desbaste" 
        ? mat.inserto_desb_sug + " (Desb.)" 
        : mat.inserto_acab_sug + " (Acab.)";

    return {
        vc: vc,
        rpm: rpm_final,
        fn: fn,
        ap: parseFloat(ap),
        vf: Vf_final,
        tm_min: parseFloat(Tm_min.toFixed(2)),
        
        // Dados para resumo e notas (usando os campos do BD)
        inserto_sug: inserto_sug,
        grau_iso: mat.grau_iso,
        grupo: mat.grupo_iso,
        kc: mat.kc,
        re: mat.re,
        nome: mat.nome,
        desafios: mat.desafios,
        operacao: operacao,
        comprimento: comprimento,
        diametro: diametro
    };
}

// ====================================================================
// --- 4. FUNÇÕES DE INTERFACE (DISPLAY) ---
// ====================================================================

/**
 * Lida com o evento de submissão do formulário.
 */
document.getElementById('calcForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const materialKey = document.getElementById('material').value;
    const diametro = parseFloat(document.getElementById('diametro').value);
    const operacao = document.getElementById('operacao').value;
    const comprimento = parseFloat(document.getElementById('comprimento').value);
    const modoMaquina = document.getElementById('modoMaquina').value; 
    
    if (!materialKey || isNaN(diametro) || isNaN(comprimento)) {
        alert("Por favor, preencha todos os campos corretamente.");
        return;
    }
    
    const materialData = materiaisCache[materialKey];
    if (!materialData) {
        alert("Dados do material não encontrados no cache.");
        return;
    }

    // Mostrar loading
    document.getElementById('loading').classList.add('show');
    document.getElementById('results').classList.remove('show');

    // Executar o cálculo
    try {
        const resultados = calcularParametros(materialData, diametro, operacao, comprimento);
        mostrarResultados(resultados, modoMaquina);
    } catch (e) {
        alert('Erro durante o cálculo: ' + e.message);
        console.error(e);
        document.getElementById('loading').classList.remove('show');
    }
});


/**
 * Exibe os resultados no HTML e desenha o gráfico.
 * @param {Object} dados - Resultados do cálculo.
 * @param {string} modoMaquina - CNC ou Convencional.
 */
function mostrarResultados(dados, modoMaquina) {
    document.getElementById('loading').classList.remove('show');
    
    const resultsDiv = document.getElementById('results');
    
    // --- 1. CONSTRUÇÃO DO HTML DE RESULTADOS ---
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

    // --- 2. DESENHAR GRÁFICO ---
    google.charts.setOnLoadCallback(() => drawChart(dados));

    // Mostrar resultados
    resultsDiv.classList.add('show');
}


/**
 * Desenha o gráfico de colunas com os parâmetros principais.
 * @param {Object} dados - Resultados do cálculo.
 */
function drawChart(dados) {
    // Escala Vc e Vf para que fiquem visíveis no mesmo gráfico com Tm
    const vf_scaled = dados.vf / 100;
    const vc_scaled = dados.vc / 100;

    var data = google.visualization.arrayToDataTable([
        ['Métrica', 'Valor', {role: 'style'}],
        ['Tempo Usinagem (min)', dados.tm_min, '#764ba2'],
        ['Vf (x100 mm/min)', vf_scaled, '#667eea'], 
        ['Vc (x100 m/min)', vc_scaled, '#8e9eeb']
    ]);

    var options = {
        title: 'Comparativo de Parâmetros Principais',
        legend: { position: "none" },
        vAxis: { title: "Valor (Escalado/Minutos)" },
        hAxis: { title: "" },
    };

    var chart = new google.visualization.ColumnChart(document.getElementById('chart_div'));
    chart.draw(data, options);
}


// ====================================================================
// --- 5. INICIALIZAÇÃO ---
// ====================================================================

// Inicia a busca por materiais ao carregar a página
document.addEventListener('DOMContentLoaded', buscarMateriais);