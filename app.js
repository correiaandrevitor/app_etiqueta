import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Modal,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Share,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────
// FIREBASE CONFIG
// ─────────────────────────────────────────────
const API_KEY    = "AIzaSyDA-EfIgc_Ai283VuJHgo86gC3YWovn7pw";
const PROJECT_ID = "projeto-android-756a1";
const AUTH_URL   = `https://identitytoolkit.googleapis.com/v1/accounts`;
const DB_URL     = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ─────────────────────────────────────────────
// CORES
// ─────────────────────────────────────────────
const COR = {
  laranja:    '#C97B2A',
  laranjaEsc: '#B5651D',
  laranjaClr: '#E8A04A',
  marrom:     '#2C1A0E',
  fundo:      '#f7f0e8',
  card:       '#fff',
  verde:      '#16a34a',
  verdeClr:   '#dcfce7',
  verdeBorda: '#86efac',
};

// ─────────────────────────────────────────────
// HELPERS FIRESTORE
// ─────────────────────────────────────────────
const toFirestore = (obj) => {
  const fields = {};
  for (const key in obj) {
    const val = obj[key];
    if (typeof val === 'string')      fields[key] = { stringValue: val };
    else if (typeof val === 'number') fields[key] = { doubleValue: val };
    else if (val instanceof Date)     fields[key] = { timestampValue: val.toISOString() };
  }
  return { fields };
};

const fromFirestore = (doc) => {
  const result = { id: doc.name.split('/').pop() };
  for (const key in doc.fields) {
    const f = doc.fields[key];
    result[key] =
      f.stringValue   ??
      f.doubleValue   ??
      f.integerValue  ??
      f.timestampValue ??
      null;
  }
  return result;
};

// ─────────────────────────────────────────────
// AUTH SERVICE
// ─────────────────────────────────────────────
const AuthService = {
  currentUser: null,

  _validarSenha(senha) {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).*$/;
    return regex.test(senha);
  },

  async register(email, senha) {
    try {
      const res = await fetch(`${AUTH_URL}:signUp?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: senha, returnSecureToken: true }),
      });
      const data = await res.json();
      if (data.error) return { ok: false, erro: data.error.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: 'Erro de conexão. Verifique sua internet.' };
    }
  },

  async login(email, senha) {
    try {
      const res = await fetch(`${AUTH_URL}:signInWithPassword?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: senha, returnSecureToken: true }),
      });
      const data = await res.json();
      if (data.error) return { ok: false, erro: data.error.message };
      this.currentUser = {
        id:           data.localId,
        email:        data.email,
        token:        data.idToken,
        refreshToken: data.refreshToken,
      };
      return { ok: true, user: this.currentUser };
    } catch (e) {
      return { ok: false, erro: 'Erro de conexão. Verifique sua internet.' };
    }
  },

  logout() {
    this.currentUser = null;
  },
};

// ─────────────────────────────────────────────
// ORÇAMENTO SERVICE
// ─────────────────────────────────────────────
const OrcService = {
  async salvar(userId, token, orc) {
    try {
      const dadosParaSalvar = {
        userId,
        largura:   orc.largura.replace(',', '.') || '0',
        altura:    orc.altura.replace(',', '.')  || '0',
        material:  orc.material || '',
        precoUnit: parseFloat(String(orc.precoUnit).replace(',', '.')) || 0,
        total:     parseFloat(String(orc.total).replace(',', '.')) || 0,
        criadoEm:  new Date(),
      };

      const res = await fetch(`${DB_URL}/orcamentos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(toFirestore(dadosParaSalvar)),
      });

      const data = await res.json();
      if (!res.ok) return { ok: false, erro: data.error?.message || 'Erro no servidor' };
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: 'Erro de conexão ao salvar.' };
    }
  },

  async listar(userId, token) {
    try {
      const res = await fetch(`${DB_URL}/orcamentos?pageSize=100`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error || !data.documents) return [];
      return data.documents
        .map(fromFirestore)
        .filter((o) => o.userId === userId)
        .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
    } catch (e) {
      return [];
    }
  },

  async deletar(id, token) {
    try {
      const res = await fetch(`${DB_URL}/orcamentos/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.status === 200 || res.status === 204) return { ok: true };
      const data = await res.json();
      return { ok: false, erro: data.error?.message || 'Erro ao excluir' };
    } catch (e) {
      return { ok: false, erro: 'Erro de conexão ao excluir.' };
    }
  },
};

// ─────────────────────────────────────────────
// COMPONENTE: TOAST
// ─────────────────────────────────────────────
function Toast({ mensagem, tipo = 'sucesso', aoEsconder }) {
  const opacidade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacidade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacidade, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => { if (aoEsconder) aoEsconder(); });
  }, []);

  const bg    = tipo === 'sucesso' ? '#15803d' : '#b91c1c';
  const icone = tipo === 'sucesso' ? '✓  '     : '⚠  ';

  return (
    <Animated.View style={[st.toast, { backgroundColor: bg, opacity: opacidade }]}>
      <Text style={st.toastTexto}>{icone}{mensagem}</Text>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
// COMPONENTE: MODAL CONFIRMAR
// ─────────────────────────────────────────────
function ModalConfirmar({ visivel, mensagem, aoConfirmar, aoCancelar }) {
  return (
    <Modal transparent animationType="fade" visible={visivel} onRequestClose={aoCancelar}>
      <View style={st.overlay}>
        <View style={st.confirmBox}>
          <Text style={st.confirmTitulo}>Confirmar exclusão</Text>
          <Text style={st.confirmMsg}>{mensagem}</Text>
          <View style={st.confirmBtns}>
            <TouchableOpacity style={st.btnCancelar} onPress={aoCancelar} activeOpacity={0.8}>
              <Text style={st.btnCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.btnExcluir} onPress={aoConfirmar} activeOpacity={0.8}>
              <Text style={st.btnExcluirTexto}>Excluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// COMPONENTE: MODAL ENVIAR ORÇAMENTO
// ─────────────────────────────────────────────
function ModalEnviar({ visivel, item, remetente, aoFechar, aoToast }) {
  const fmtValor = (n) => 'R$ ' + Number(n).toFixed(2).replace('.', ',');
  const fmtData  = (iso) => new Date(iso).toLocaleDateString('pt-BR');

  const limparEFechar = () => aoFechar();

  const gerarMensagem = () => {
    const linhas = [
      '🏷️ *Orçamento de Etiquetas*',
      '',
      '━━━━━━━━━━━━━━━━━━━━━',
      item.material    ? '🧾 *Material:*    ' + item.material    : null,
      item.largura     ? '↔️ *Largura:*     ' + item.largura + ' cm' : null,
      item.altura      ? '↕️ *Altura:*      ' + item.altura + ' cm'  : null,
      '💲 *Preço unit.:* ' + fmtValor(item.precoUnit),
      '━━━━━━━━━━━━━━━━━━━━━',
      '💰 *TOTAL: ' + fmtValor(item.total) + '*',
      '━━━━━━━━━━━━━━━━━━━━━',
      '',
      '📅 Data: ' + fmtData(item.criadoEm),
      '',
      '_Atenciosamente,_',
      '_' + remetente + '_',
    ].filter((l) => l !== null);
    return linhas.join('\n');
  };

  const enviarWhatsApp = async () => {
    try {
      const mensagem = encodeURIComponent(gerarMensagem());
      await Linking.openURL(`https://wa.me/?text=${mensagem}`);
      aoToast('WhatsApp aberto!');
      limparEFechar();
    } catch (e) {
      aoToast('Erro ao abrir WhatsApp', 'erro');
    }
  };

  const enviarEmail = async () => {
    try {
      const assunto = encodeURIComponent('Orçamento de Etiquetas');
      const corpo = encodeURIComponent(gerarMensagem());
      await Linking.openURL(`mailto:?subject=${assunto}&body=${corpo}`);
      aoToast('E-mail aberto!');
      limparEFechar();
    } catch (e) {
      aoToast('Erro ao abrir e-mail', 'erro');
    }
  };

  if (!item) return null;

  return (
    <Modal transparent animationType="slide" visible={visivel} onRequestClose={limparEFechar}>
      <View style={st.overlay}>
        <View style={st.enviarBox}>
          <View style={st.enviarHeader}>
            <Text style={st.enviarTitulo}>📤 Enviar Orçamento</Text>
            <TouchableOpacity onPress={limparEFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={st.enviarFechar}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={st.enviarResumo}>
            <View style={st.enviarResumoLinha}>
              <Text style={st.enviarResumoLabel}>Total</Text>
              <Text style={st.enviarResumoTotal}>{fmtValor(item.total)}</Text>
            </View>
            <Text style={st.enviarResumoDetalhe}>
              {item.material} • {item.largura} x {item.altura}
            </Text>
          </View>

          <View style={{ marginTop: 15, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 25, marginBottom: 20 }}>
              <TouchableOpacity onPress={enviarWhatsApp} activeOpacity={0.8} style={{ alignItems: 'center' }}>
                <View style={{ backgroundColor: '#25D366', width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 35 }}>💬</Text>
                </View>
                <Text style={{ fontSize: 12, color: COR.marrom, marginTop: 5, fontWeight: '600' }}>WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={enviarEmail} activeOpacity={0.8} style={{ alignItems: 'center' }}>
                <View style={{ backgroundColor: '#EA4335', width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 35 }}>✉️</Text>
                </View>
                <Text style={{ fontSize: 12, color: COR.marrom, marginTop: 5, fontWeight: '600' }}>E-mail</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={st.btnCancelar} onPress={limparEFechar} activeOpacity={0.8}>
              <Text style={st.btnCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// COMPONENTE: INDICADOR DE FORÇA DE SENHA
// ─────────────────────────────────────────────
function IndicadorForcaSenha({ senha, mostrarRequisitos = false }) {
  const temMinuscula = /[a-z]/.test(senha);
  const temMaiuscula = /[A-Z]/.test(senha);
  const temNumero    = /[0-9]/.test(senha);
  const temEspecial  = /[!@#$%^&*]/.test(senha);

  if (!mostrarRequisitos) return null;

  const Requisito = ({ atendido, texto }) => (
    <View style={st.requisitoLinha}>
      <Text style={{ fontSize: 12, marginRight: 8 }}>{atendido ? '✓' : '○'}</Text>
      <Text style={[st.requisitoTexto, atendido ? st.requisitoAtendido : st.requisitoNaoAtendido]}>
        {texto}
      </Text>
    </View>
  );

  return (
    <View style={st.requisitoBox}>
      <Requisito atendido={senha.length >= 8} texto="Mínimo 8 caracteres" />
      <Requisito atendido={temMinuscula && temMaiuscula} texto="Letras maiúsculas e minúsculas" />
      <Requisito atendido={temNumero} texto="Pelo menos um número" />
      <Requisito atendido={temEspecial} texto="Caractere especial (!@#$%^&*)" />
    </View>
  );
}

// ─────────────────────────────────────────────
// COMPONENTE: CAMPO DE INPUT
// ─────────────────────────────────────────────
const Campo = ({ label, valor, aoMudar, placeholder, teclado = 'default', senha = false, icone = null }) => (
  <View style={st.campoContainer}>
    <Text style={st.label}>{label}</Text>
    <View style={st.campoLinha}>
      {icone && <View style={st.campoIconeWrap}>{icone}</View>}
      <TextInput
        style={st.input}
        value={valor}
        onChangeText={aoMudar}
        placeholder={placeholder}
        placeholderTextColor="#b08060"
        keyboardType={teclado}
        secureTextEntry={senha}
        autoCapitalize="none"
      />
    </View>
  </View>
);

// ─────────────────────────────────────────────
// TELA: LOGIN / CADASTRO
// ─────────────────────────────────────────────
function TelaAuth({ aoLogar }) {
  const [aba, setAba]           = useState('login');
  const [email, setEmail]       = useState('');
  const [senha, setSenha]       = useState('');
  const [carregando, setCarregando] = useState(false);
  const [toast, setToast]       = useState(null);

  useEffect(() => {
    const carregarEmail = async () => {
      const salvo = await AsyncStorage.getItem('@ultimo_email');
      if (salvo) setEmail(salvo);
    };
    carregarEmail();
  }, []);

  const exibirToast = (mensagem, tipo = 'sucesso') => setToast({ mensagem, tipo });

  const validar = () => {
    if (!email.includes('@')) { exibirToast('E-mail inválido', 'erro'); return false; }
    if (senha.length < 6) { exibirToast('Senha muito curta', 'erro'); return false; }
    if (aba === 'cadastro' && !AuthService._validarSenha(senha)) {
      exibirToast('A senha não atende aos requisitos', 'erro');
      return false;
    }
    return true;
  };

  const acao = async () => {
    if (!validar()) return;
    setCarregando(true);
    const res = aba === 'login' 
      ? await AuthService.login(email, senha)
      : await AuthService.register(email, senha);
    
    if (res.ok) {
      if (aba === 'login') {
        await AsyncStorage.setItem('@ultimo_email', email);
        aoLogar(res.user);
      } else {
        exibirToast('Conta criada! Faça login.');
        setAba('login');
      }
    } else exibirToast(res.erro, 'erro');
    setCarregando(false);
  };

  return (
    <SafeAreaView style={st.mainSafe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={st.authScroll} bounces={false}>
          <View style={st.authCard}>
            <View style={st.logoContainer}>
              <View style={st.logoCirculo}>
                <Text style={{ fontSize: 40 }}>🏷️</Text>
              </View>
              <Text style={st.logoTitulo}>EtiquetaFácil</Text>
              <Text style={st.logoSub}>Orçamentos Profissionais</Text>
            </View>

            <View style={st.authAbas}>
              <TouchableOpacity style={[st.authAba, aba === 'login' && st.authAbaAtiva]} onPress={() => setAba('login')}>
                <Text style={[st.authAbaTexto, aba === 'login' && st.authAbaTextoAtiva]}>Entrar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.authAba, aba === 'cadastro' && st.authAbaAtiva]} onPress={() => setAba('cadastro')}>
                <Text style={[st.authAbaTexto, aba === 'cadastro' && st.authAbaTextoAtiva]}>Criar Conta</Text>
              </TouchableOpacity>
            </View>

            <Campo label="E-mail" valor={email} aoMudar={setEmail} placeholder="seu@email.com" teclado="email-address" />
            <Campo label="Senha" valor={senha} aoMudar={setSenha} placeholder="••••••••" senha />
            
            <IndicadorForcaSenha senha={senha} mostrarRequisitos={aba === 'cadastro'} />

            <TouchableOpacity style={[st.btnPrimario, carregando && st.btnDesabilitado]} onPress={acao} disabled={carregando}>
              {carregando ? <ActivityIndicator color="#fff" /> : <Text style={st.btnPrimarioTexto}>{aba === 'login' ? 'ENTRAR' : 'CADASTRAR'}</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {toast && <Toast mensagem={toast.mensagem} tipo={toast.tipo} aoEsconder={() => setToast(null)} />}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// TELA DE ORÇAMENTOS
// ─────────────────────────────────────────────
const LISTA_MATERIAIS = [
  { nome: 'BOPP Brilho', preco: 1.50 },
  { nome: 'BOPP Fosco', preco: 1.65 },
  { nome: 'BOPP Metalizado', preco: 2.10 },
  { nome: 'BOPP Transparente', preco: 1.80 },
  { nome: 'Papel Couché', preco: 0.95 },
  { nome: 'Papel Térmico', preco: 1.20 },
  { nome: 'Papel Transtherm', preco: 1.10 },
  { nome: 'Vinil Branco', preco: 2.50 },
  { nome: 'Vinil Transparente', preco: 2.70 },
  { nome: 'Poliéster Prata', preco: 4.50 },
  // REMOVIDO: Void (Segurança)
  // REMOVIDO: Casca de Ovo
];

const ORC_VAZIO = { 
  material: LISTA_MATERIAIS[0].nome, 
  largura: '', 
  altura: '', 
  precoUnit: String(LISTA_MATERIAIS[0].preco), 
  total: '0,00' 
};

function TelaOrcamentos({ user, aoSair }) {
  const [form, setForm]             = useState(ORC_VAZIO);
  const [lista, setLista]           = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [toast, setToast]           = useState(null);
  const [modalMaterial, setModalMaterial] = useState(false);
  const [confirmar, setConfirmar]   = useState(null);
  const [enviarItem, setEnviarItem] = useState(null);

  useEffect(() => { carregarLista(); }, []);

  const carregarLista = async () => {
    const dados = await OrcService.listar(user.id, user.token);
    setLista(dados);
  };

  const exibirToast = (mensagem, tipo = 'sucesso') => setToast({ mensagem, tipo });

  const atualizarCampo = (campo, valor) => {
    setForm((prev) => {
      const novo = { ...prev, [campo]: valor };
      if (campo === 'material') {
        const mat = LISTA_MATERIAIS.find(m => m.nome === valor);
        if (mat) novo.precoUnit = String(mat.preco);
      }
      const larg = parseFloat(novo.largura.replace(',', '.')) || 0;
      const alt  = parseFloat(novo.altura.replace(',', '.'))  || 0;
      const prec = parseFloat(novo.precoUnit.replace(',', '.')) || 0;
      const total = (larg * alt / 1000) * prec;
      novo.total = total.toFixed(2).replace('.', ',');
      return novo;
    });
  };

  const salvar = async () => {
    if (!form.largura || !form.altura || !form.precoUnit) {
      exibirToast('Preencha os campos obrigatórios', 'erro');
      return;
    }
    setCarregando(true);
    const res = await OrcService.salvar(user.id, user.token, form);
    if (res.ok) {
      exibirToast('Salvo!');
      setForm(ORC_VAZIO);
      carregarLista();
    } else exibirToast(res.erro, 'erro');
    setCarregando(false);
  };

  return (
    <SafeAreaView style={st.mainSafe}>
      <StatusBar barStyle="light-content" />
      <View style={st.topBar}>
        <Text style={st.topBarEmail} numberOfLines={1}>{user.email}</Text>
        <TouchableOpacity style={st.btnSair} onPress={aoSair}><Text style={st.btnSairTexto}>Sair</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={st.mainScroll}>
        <View style={st.card}>
          <Text style={st.cardTitulo}>Novo Orçamento</Text>
          
          <Text style={st.label}>MATERIAL</Text>
          <TouchableOpacity style={st.seletorMaterial} onPress={() => setModalMaterial(true)}>
            <Text style={st.seletorMaterialTexto}>{form.material}</Text>
            <Text style={{ color: COR.laranja }}>▼</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', marginTop: 15 }}>
            <View style={{ flex: 1 }}><Campo label="Largura (cm)" valor={form.largura} aoMudar={v => atualizarCampo('largura', v)} placeholder="ex: 10" teclado="numeric" /></View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}><Campo label="Altura (cm)" valor={form.altura} aoMudar={v => atualizarCampo('altura', v)} placeholder="ex: 5" teclado="numeric" /></View>
          </View>
          
          <Campo label="Preço Unitário (R$)" valor={form.precoUnit} aoMudar={v => atualizarCampo('precoUnit', v)} placeholder="0.25" teclado="numeric" />
          
          <View style={st.totalBox}>
            <View><Text style={st.totalLabel}>Total</Text><Text style={st.totalSubLabel}>por milheiro</Text></View>
            <Text style={st.totalValor}>R$ {form.total}</Text>
          </View>

          <TouchableOpacity style={[st.btnSalvar, carregando && st.btnDesabilitado]} onPress={salvar} disabled={carregando}>
            {carregando ? <ActivityIndicator color="#fff" /> : <Text style={st.btnSalvarTexto}>💾 SALVAR ORÇAMENTO</Text>}
          </TouchableOpacity>
        </View>

        <Text style={st.secaoTitulo}>Histórico Recente</Text>
        {lista.map((item) => (
          <View key={item.id} style={st.orcCard}>
            <View style={st.orcCardInfo}>
              <Text style={st.orcCardMat}>{item.material}</Text>
              <Text style={st.orcCardDim}>{item.largura} x {item.altura} cm • R$ {item.total}</Text>
            </View>
            <View style={st.orcCardAcoes}>
              <TouchableOpacity style={st.orcBtnAcao} onPress={() => setEnviarItem(item)}><Text style={{ fontSize: 18 }}>📤</Text></TouchableOpacity>
              <TouchableOpacity style={st.orcBtnAcao} onPress={() => setConfirmar({ id: item.id })}><Text style={{ fontSize: 18 }}>🗑️</Text></TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={modalMaterial} transparent animationType="fade">
        <View style={st.overlay}>
          <View style={st.modalLista}>
            <View style={st.modalListaHeader}>
              <Text style={st.modalListaTitulo}>Selecione o Material</Text>
              <TouchableOpacity onPress={() => setModalMaterial(false)}><Text style={st.modalListaFechar}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView>
              {LISTA_MATERIAIS.map((m) => (
                <TouchableOpacity key={m.nome} style={[st.modalListaItem, form.material === m.nome && st.modalListaItemAtivo]} onPress={() => { atualizarCampo('material', m.nome); setModalMaterial(false); }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.modalListaItemTexto, form.material === m.nome && st.modalListaItemTextoAtiva]}>{m.nome}</Text>
                    <Text style={st.modalListaItemSub}>Preço base: R$ {m.preco.toFixed(2).replace('.', ',')}</Text>
                  </View>
                  {form.material === m.nome && <Text style={st.modalListaItemCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {confirmar && <ModalConfirmar visivel mensagem="Excluir este orçamento?" aoCancelar={() => setConfirmar(null)} aoConfirmar={async () => {
        const res = await OrcService.deletar(confirmar.id, user.token);
        if (res.ok) { carregarLista(); exibirToast('Excluído'); }
        setConfirmar(null);
      }} />}
      
      {enviarItem && <ModalEnviar visivel item={enviarItem} remetente={user.email} aoFechar={() => setEnviarItem(null)} aoToast={exibirToast} />}
      {toast && <Toast mensagem={toast.mensagem} tipo={toast.tipo} aoEsconder={() => setToast(null)} />}
    </SafeAreaView>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  return user ? <TelaOrcamentos user={user} aoSair={() => setUser(null)} /> : <TelaAuth aoLogar={setUser} />;
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const st = StyleSheet.create({
  mainSafe: { flex: 1, backgroundColor: COR.fundo },
  authScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  authCard: { backgroundColor: '#fff', borderRadius: 20, padding: 25, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10 },
  logoContainer: { alignItems: 'center', marginBottom: 30 },
  logoCirculo: { width: 80, height: 80, borderRadius: 40, backgroundColor: COR.fundo, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  logoTitulo: { fontSize: 26, fontWeight: '800', color: COR.marrom },
  logoSub: { fontSize: 14, color: '#8a6a4a', fontWeight: '500' },
  authAbas: { flexDirection: 'row', marginBottom: 25, backgroundColor: COR.fundo, borderRadius: 12, padding: 4 },
  authAba: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  authAbaAtiva: { backgroundColor: '#fff', elevation: 2 },
  authAbaTexto: { fontSize: 14, fontWeight: '600', color: '#8a6a4a' },
  authAbaTextoAtiva: { color: COR.laranja },
  campoContainer: { marginBottom: 18 },
  label: { fontSize: 11, fontWeight: '700', color: '#8a6a4a', marginBottom: 6, textTransform: 'uppercase' },
  campoLinha: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fdf8f3', borderWidth: 1.5, borderColor: '#e8d5be', borderRadius: 10 },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 10, fontSize: 15, color: COR.marrom },
  btnPrimario: { backgroundColor: COR.laranja, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  btnDesabilitado: { opacity: 0.5 },
  btnPrimarioTexto: { color: '#fff', fontWeight: '700', fontSize: 15 },
  topBar: { backgroundColor: COR.laranjaEsc, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  topBarEmail: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  btnSair: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  btnSairTexto: { color: '#fff', fontSize: 12, fontWeight: '700' },
  mainScroll: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 20, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  cardTitulo: { fontSize: 18, fontWeight: '700', color: COR.marrom, marginBottom: 20 },
  seletorMaterial: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fdf8f3', borderWidth: 1.5, borderColor: '#e8d5be', borderRadius: 10, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 10, marginBottom: 5 },
  seletorMaterialTexto: { flex: 1, fontSize: 15, color: COR.marrom },
  totalBox: { backgroundColor: COR.laranja, borderRadius: 12, padding: 15, marginVertical: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  totalSubLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
  totalValor: { color: '#fff', fontSize: 22, fontWeight: '800' },
  btnSalvar: { backgroundColor: COR.marrom, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  btnSalvarTexto: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secaoTitulo: { fontSize: 16, fontWeight: '700', color: COR.marrom, marginTop: 25, marginBottom: 15 },
  orcCard: { backgroundColor: '#fff', borderRadius: 15, padding: 15, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  orcCardInfo: { flex: 1 },
  orcCardMat: { fontSize: 15, fontWeight: '700', color: COR.marrom, marginBottom: 3 },
  orcCardDim: { fontSize: 13, color: '#8a6a4a' },
  orcCardAcoes: { flexDirection: 'row' },
  orcBtnAcao: { width: 40, height: 40, borderRadius: 20, backgroundColor: COR.fundo, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalLista: { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxHeight: '80%', overflow: 'hidden' },
  modalListaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalListaTitulo: { fontSize: 17, fontWeight: '700', color: COR.marrom },
  modalListaFechar: { fontSize: 18, color: '#999' },
  modalListaItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#f9f9f9' },
  modalListaItemAtivo: { backgroundColor: '#fdf8f3' },
  modalListaItemTexto: { fontSize: 15, color: COR.marrom },
  modalListaItemTextoAtiva: { color: COR.laranja, fontWeight: '700' },
  modalListaItemSub: { fontSize: 12, color: '#8a6a4a', marginTop: 2 },
  modalListaItemCheck: { color: COR.laranja, fontSize: 16, fontWeight: '700' },
  toast: { position: 'absolute', bottom: 50, left: 20, right: 20, borderRadius: 12, padding: 15, elevation: 10 },
  toastTexto: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  confirmBox: { backgroundColor: '#fff', borderRadius: 20, padding: 25, width: '100%', alignItems: 'center' },
  confirmTitulo: { fontSize: 18, fontWeight: '700', color: COR.marrom, marginBottom: 10 },
  confirmMsg: { fontSize: 14, color: '#8a6a4a', textAlign: 'center', marginBottom: 25 },
  confirmBtns: { flexDirection: 'row', width: '100%' },
  btnCancelar: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#ddd', marginRight: 10 },
  btnCancelarTexto: { color: '#666', fontWeight: '600' },
  btnExcluir: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: '#ef4444' },
  btnExcluirTexto: { color: '#fff', fontWeight: '600' },
  enviarBox: { backgroundColor: '#fff', borderRadius: 20, padding: 25, width: '100%' },
  enviarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  enviarTitulo: { fontSize: 18, fontWeight: '700', color: COR.marrom },
  enviarFechar: { fontSize: 18, color: '#999' },
  enviarResumo: { backgroundColor: COR.fundo, borderRadius: 12, padding: 15, marginBottom: 20 },
  enviarResumoLinha: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  enviarResumoLabel: { fontSize: 12, color: '#8a6a4a' },
  enviarResumoTotal: { fontSize: 18, fontWeight: '800', color: COR.laranja },
  enviarResumoDetalhe: { fontSize: 13, color: COR.marrom, fontWeight: '500' },
  requisitoBox: { backgroundColor: '#fdf8f3', borderRadius: 10, padding: 12, marginBottom: 15, borderWidth: 1, borderColor: '#e8d5be' },
  requisitoLinha: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  requisitoTexto: { fontSize: 12 },
  requisitoAtendido: { color: COR.verde, fontWeight: '600' },
  requisitoNaoAtendido: { color: '#9a7560' },
});
