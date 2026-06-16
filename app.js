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
      // Limpa os valores para garantir que sejam números válidos no Firestore
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
      
      if (!res.ok) {
        return { ok: false, erro: data.error?.message || 'Erro no servidor' };
      }
      
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
  const [telefone, setTelefone]             = useState('');
  const [email, setEmail]                   = useState('');
  const [enviando, setEnviando]             = useState(false);
  const [abaSelecionada, setAbaSelecionada] = useState('whatsapp');

  const fmtValor = (n) => 'R$ ' + Number(n).toFixed(2).replace('.', ',');
  const fmtData  = (iso) => new Date(iso).toLocaleDateString('pt-BR');

  const limparEFechar = () => {
    setTelefone('');
    setEmail('');
    setAbaSelecionada('whatsapp');
    aoFechar();
  };

  const aoMudarTelefone = (texto) => setTelefone(texto.replace(/\D/g, ''));

  const telefoneFormatado = () => {
    const d = telefone;
    if (d.length <= 2)  return d.length ? '(' + d : '';
    if (d.length <= 6)  return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7, 11);
  };

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
    if (telefone.length < 10) {
      aoToast('Informe um número com DDD (mínimo 10 dígitos)', 'erro');
      return;
    }
    setEnviando(true);
    const numeroIntl  = '55' + telefone;
    const mensagem    = encodeURIComponent(gerarMensagem());
    const url         = 'whatsapp://send?phone=' + numeroIntl + '&text=' + mensagem;
    const urlFallback = 'https://wa.me/' + numeroIntl + '?text=' + mensagem;
    try {
      const podeNativo = await Linking.canOpenURL(url);
      await Linking.openURL(podeNativo ? url : urlFallback);
      aoToast('WhatsApp aberto!');
      limparEFechar();
    } catch (e) {
      aoToast('Erro ao abrir WhatsApp', 'erro');
    } finally {
      setEnviando(false);
    }
  };

  const enviarEmail = async () => {
    if (!email.trim()) {
      aoToast('Informe um e-mail válido', 'erro');
      return;
    }
    setEnviando(true);
    const assunto = encodeURIComponent('Orçamento de Etiquetas');
    const corpo   = encodeURIComponent(gerarMensagem());
    const urlEmail = 'mailto:' + email + '?subject=' + assunto + '&body=' + corpo;
    try {
      await Linking.openURL(urlEmail);
      aoToast('E-mail aberto!');
      limparEFechar();
    } catch (e) {
      aoToast('Erro ao abrir e-mail', 'erro');
    } finally {
      setEnviando(false);
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

          <View style={st.abas}>
            <TouchableOpacity
              style={[st.abaBtn, abaSelecionada === 'whatsapp' && st.abaBtnAtiva]}
              onPress={() => setAbaSelecionada('whatsapp')}
              activeOpacity={0.8}>
              <Text style={[st.abaBtnTexto, abaSelecionada === 'whatsapp' && st.abaBtnTextoAtiva]}>💬 WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.abaBtn, abaSelecionada === 'email' && st.abaBtnAtiva]}
              onPress={() => setAbaSelecionada('email')}
              activeOpacity={0.8}>
              <Text style={[st.abaBtnTexto, abaSelecionada === 'email' && st.abaBtnTextoAtiva]}>✉️ E-mail</Text>
            </TouchableOpacity>
          </View>

          <View style={st.enviarResumo}>
            <View style={st.enviarResumoLinha}>
              <Text style={st.enviarResumoLabel}>Total</Text>
              <Text style={st.enviarResumoTotal}>{fmtValor(item.total)}</Text>
            </View>
            <Text style={st.enviarResumoDetalhe}>
              {item.material ? item.material : 'Sem material'} • {item.largura} x {item.altura}
            </Text>
          </View>

          {abaSelecionada === 'whatsapp' ? (
            <>
              <Text style={st.enviarCampoLabel}>WhatsApp do cliente (com DDD)</Text>
              <View style={st.campoLinha}>
                <Text style={st.telPrefixo}>🇧🇷 +55</Text>
                <TextInput
                  style={[st.input, { flex: 1 }]}
                  value={telefoneFormatado()}
                  onChangeText={aoMudarTelefone}
                  placeholder="(11) 91234-5678"
                  placeholderTextColor="#b08060"
                  keyboardType="phone-pad"
                  maxLength={16}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={st.enviarCampoLabel}>E-mail do cliente</Text>
              <View style={st.campoLinha}>
                <TextInput
                  style={[st.input, { flex: 1 }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="cliente@email.com"
                  placeholderTextColor="#b08060"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </>
          )}

          <View style={st.confirmBtns}>
            <TouchableOpacity style={st.btnCancelar} onPress={limparEFechar} activeOpacity={0.8}>
              <Text style={st.btnCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.btnEnviar, enviando && st.btnDesabilitado]}
              onPress={abaSelecionada === 'whatsapp' ? enviarWhatsApp : enviarEmail}
              disabled={enviando}
              activeOpacity={0.85}>
              {enviando
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={st.btnEnviarTexto}>
                    {abaSelecionada === 'whatsapp' ? 'Enviar  💬' : 'Enviar  ✉️'}
                  </Text>
              }
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
      <Requisito atendido={temMaiuscula}       texto="Letra maiúscula (A-Z)" />
      <Requisito atendido={temMinuscula}       texto="Letra minúscula (a-z)" />
      <Requisito atendido={temNumero}          texto="Número (0-9)" />
      <Requisito atendido={temEspecial}        texto="Caractere especial (!@#$%^&*)" />
    </View>
  );
}

// ─────────────────────────────────────────────
// COMPONENTE: CAMPO DE INPUT
// ─────────────────────────────────────────────
function Campo({ label, valor, aoMudar, placeholder, teclado = 'default', senha = false, iconeDir }) {
  return (
    <View style={st.campoWrap}>
      {!!label && <Text style={st.campoLabel}>{label}</Text>}
      <View style={st.campoLinha}>
        <TextInput
          style={[st.input, iconeDir ? { paddingRight: 50 } : null]}
          value={valor}
          onChangeText={aoMudar}
          placeholder={placeholder}
          placeholderTextColor="#b08060"
          keyboardType={teclado}
          secureTextEntry={senha}
          autoCapitalize="none"
        />
        {iconeDir && <View style={st.campoDirWrap}>{iconeDir}</View>}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// TELA DE LOGIN / CADASTRO
// ─────────────────────────────────────────────
function TelaLogin({ aoLogar }) {
  const [modoLogin, setModoLogin]               = useState(true);
  const [email, setEmail]                       = useState('');
  const [senha, setSenha]                       = useState('');
  const [mostrarSenha, setMostrarSenha]         = useState(false);
  const [carregando, setCarregando]             = useState(false);
  const [erroMsg, setErroMsg]                   = useState('');

  const trocarModo = (paraLogin) => {
    setModoLogin(paraLogin);
    setErroMsg('');
    setEmail('');
    setSenha('');
  };

  const enviar = async () => {
    setErroMsg('');
    if (!email.trim() || !senha.trim()) {
      setErroMsg('Preencha todos os campos');
      return;
    }
    setCarregando(true);
    try {
      if (!modoLogin) {
        const res = await AuthService.register(email, senha);
        if (res.ok) {
          setErroMsg('Conta criada! Faça login.');
          trocarModo(true);
        } else {
          setErroMsg(res.erro);
        }
      } else {
        const res = await AuthService.login(email, senha);
        if (res.ok) {
          aoLogar(res.user);
        } else {
          setErroMsg(res.erro);
        }
      }
    } catch (e) {
      setErroMsg('Erro inesperado.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <SafeAreaView style={st.loginSafe}>
      <StatusBar barStyle="light-content" backgroundColor={COR.laranjaEsc} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={st.loginScroll} keyboardShouldPersistTaps="handled">
          <View style={st.logoArea}>
            <View style={st.logoBox}><Text style={st.logoEmoji}>🏷️</Text></View>
            <Text style={st.appTitulo}>EtiquetaFácil</Text>
            <Text style={st.appSub}>Orçamentos de etiquetas</Text>
          </View>

          <View style={st.loginCard}>
            <View style={st.tabs}>
              <TouchableOpacity style={[st.tabBtn, modoLogin && st.tabBtnAtivo]} onPress={() => trocarModo(true)}><Text style={[st.tabBtnTexto, modoLogin && st.tabBtnTextoAtivo]}>Entrar</Text></TouchableOpacity>
              <TouchableOpacity style={[st.tabBtn, !modoLogin && st.tabBtnAtivo]} onPress={() => trocarModo(false)}><Text style={[st.tabBtnTexto, !modoLogin && st.tabBtnTextoAtivo]}>Cadastrar</Text></TouchableOpacity>
            </View>

            {!!erroMsg && <View style={st.erroBox}><Text style={st.erroTexto}>⚠ {erroMsg}</Text></View>}

            <Campo label="E-mail" valor={email} aoMudar={setEmail} placeholder="seu@email.com" teclado="email-address" />
            <Campo label="Senha" valor={senha} aoMudar={setSenha} placeholder="senha" senha={!mostrarSenha} iconeDir={<TouchableOpacity onPress={() => setMostrarSenha(!mostrarSenha)}><Text>{mostrarSenha ? '🙈' : '👁️'}</Text></TouchableOpacity>} />
            
            {!modoLogin && <IndicadorForcaSenha senha={senha} mostrarRequisitos={true} />}

            <TouchableOpacity style={[st.btnPrimario, carregando && st.btnDesabilitado]} onPress={enviar} disabled={carregando}>
              {carregando ? <ActivityIndicator color="#fff" /> : <Text style={st.btnPrimarioTexto}>{modoLogin ? 'ENTRAR' : 'CRIAR CONTA'}</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  { nome: 'Void (Segurança)', preco: 6.00 },
  { nome: 'Casca de Ovo', preco: 5.50 },
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
  const [confirmar, setConfirmar]   = useState(null);
  const [enviarItem, setEnviarItem] = useState(null);
  const [modalMaterial, setModalMaterial] = useState(false);

  useEffect(() => { carregarLista(); }, []);

  const carregarLista = async () => {
    const items = await OrcService.listar(user.id, user.token);
    setLista(items);
  };

  const exibirToast = (mensagem, tipo = 'sucesso') => setToast({ mensagem, tipo });

  const atualizarCampo = (campo, valor) => {
    setForm((prev) => {
      const novo = { ...prev, [campo]: valor };
      
      // Se mudar o material, atualiza o preço unitário automaticamente
      if (campo === 'material') {
        const mat = LISTA_MATERIAIS.find(m => m.nome === valor);
        if (mat) novo.precoUnit = String(mat.preco);
      }

      const larg = parseFloat(novo.largura.replace(',', '.')) || 0;
      const alt  = parseFloat(novo.altura.replace(',', '.'))  || 0;
      const prec = parseFloat(novo.precoUnit.replace(',', '.')) || 0;
      
      // FÓRMULA: (Largura * Altura / 1000) * Preço = R$/Milheiro
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
    const res = await OrcService.salvar(user.id, user.token, {
      ...form,
      total: parseFloat(form.total.replace(',', '.')) || 0,
    });
    if (res.ok) {
      exibirToast('Salvo!');
      setForm(ORC_VAZIO);
      carregarLista();
    } else exibirToast(res.erro, 'erro');
    setCarregando(false);
  };

  const pedirDelecao = (id) => {
    setConfirmar({
      mensagem: 'Excluir orçamento?',
      aoConfirmar: async () => {
        setConfirmar(null);
        const res = await OrcService.deletar(id, user.token);
        if (res.ok) { exibirToast('Excluído'); carregarLista(); }
        else exibirToast(res.erro, 'erro');
      },
    });
  };

  return (
    <SafeAreaView style={st.mainSafe}>
      <StatusBar barStyle="light-content" backgroundColor={COR.laranjaEsc} />
      <View style={st.topBar}>
        <Text style={st.topEmail} numberOfLines={1}>{user.email}</Text>
        <TouchableOpacity style={st.btnSair} onPress={aoSair}><Text style={st.btnSairTexto}>Sair</Text></TouchableOpacity>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={st.mainScroll} keyboardShouldPersistTaps="handled">
          <Text style={st.secaoTitulo}>Novo Orçamento</Text>
          <View style={st.formCard}>
            <Text style={st.campoLabel}>Material</Text>
            <TouchableOpacity 
              style={st.seletorMaterial} 
              onPress={() => setModalMaterial(true)}
              activeOpacity={0.7}
            >
              <Text style={st.seletorMaterialTexto}>{form.material}</Text>
              <Text style={st.seletorMaterialIcone}>▼</Text>
            </TouchableOpacity>

            <View style={st.linha2}>
              <View style={{ flex: 1 }}><Campo label="Largura (cm)" valor={form.largura} aoMudar={v => atualizarCampo('largura', v)} placeholder="ex: 10" teclado="numeric" /></View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}><Campo label="Altura (cm)" valor={form.altura} aoMudar={v => atualizarCampo('altura', v)} placeholder="ex: 5" teclado="numeric" /></View>
            </View>
            <Campo label="Preço Unitário (R$)" valor={form.precoUnit} aoMudar={v => atualizarCampo('precoUnit', v)} placeholder="0.25" teclado="numeric" />
            <View style={st.totalBox}>
              <View>
                <Text style={st.totalLabel}>Total</Text>
                <Text style={st.totalSubLabel}>por milheiro</Text>
              </View>
              <Text style={st.totalValor}>R$ {form.total}</Text>
            </View>
            <TouchableOpacity style={[st.btnSalvar, carregando && st.btnDesabilitado]} onPress={salvar} disabled={carregando}>
              {carregando ? <ActivityIndicator color="#fff" /> : <Text style={st.btnSalvarTexto}>💾 SALVAR ORÇAMENTO</Text>}
            </TouchableOpacity>
          </View>

          <View style={st.listaHeader}><Text style={st.secaoTitulo}>Orçamentos Salvos</Text><View style={st.contadorBadge}><Text style={st.contadorTexto}>{lista.length}</Text></View></View>
          {lista.map(item => (
            <View key={item.id} style={st.itemCard}>
              <View style={st.itemInfo}>
                <Text style={st.itemTotal}>R$ {Number(item.total).toFixed(2).replace('.', ',')}</Text>
                <Text style={st.itemLinha}>{item.material} • {item.largura}x{item.altura} cm</Text>
              </View>
              <View style={st.itemAcoes}>
                <TouchableOpacity style={st.btnEnviarCard} onPress={() => setEnviarItem(item)}><Text style={st.btnEnviarCardTexto}>Enviar</Text></TouchableOpacity>
                <TouchableOpacity style={st.btnDeletar} onPress={() => pedirDelecao(item.id)}><Text style={st.btnDeletarTexto}>✕</Text></TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
      {!!toast && <Toast mensagem={toast.mensagem} tipo={toast.tipo} aoEsconder={() => setToast(null)} />}
      <ModalConfirmar visivel={!!confirmar} mensagem={confirmar?.mensagem} aoConfirmar={confirmar?.aoConfirmar} aoCancelar={() => setConfirmar(null)} />
      <ModalEnviar visivel={!!enviarItem} item={enviarItem} remetente={user.email} aoFechar={() => setEnviarItem(null)} aoToast={exibirToast} />

      {/* Modal de Seleção de Material */}
      <Modal transparent animationType="slide" visible={modalMaterial} onRequestClose={() => setModalMaterial(false)}>
        <View style={st.overlay}>
          <View style={st.modalListaBox}>
            <View style={st.modalListaHeader}>
              <Text style={st.modalListaTitulo}>Selecione o Material</Text>
              <TouchableOpacity onPress={() => setModalMaterial(false)}>
                <Text style={st.modalListaFechar}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={st.modalListaScroll}>
              {LISTA_MATERIAIS.map((m) => (
                <TouchableOpacity 
                  key={m.nome} 
                  style={[st.modalListaItem, form.material === m.nome && st.modalListaItemAtivo]} 
                  onPress={() => {
                    atualizarCampo('material', m.nome);
                    setModalMaterial(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[st.modalListaItemTexto, form.material === m.nome && st.modalListaItemTextoAtivo]}>{m.nome}</Text>
                    <Text style={st.modalListaItemSub}>Preço base: R$ {m.preco.toFixed(2).replace('.', ',')}</Text>
                  </View>
                  {form.material === m.nome && <Text style={st.modalListaItemCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// APP PRINCIPAL
// ─────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);

  return user ? (
    <TelaOrcamentos user={user} aoSair={() => setUser(null)} />
  ) : (
    <TelaLogin aoLogar={u => setUser(u)} />
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const st = StyleSheet.create({
  loginSafe: { flex: 1, backgroundColor: COR.laranjaEsc },
  loginScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  logoArea: { alignItems: 'center', marginBottom: 28 },
  logoBox: { width: 84, height: 84, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  logoEmoji: { fontSize: 38 },
  appTitulo: { fontSize: 26, fontWeight: '700', color: '#fff' },
  appSub: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  loginCard: { backgroundColor: COR.card, borderRadius: 22, padding: 22, elevation: 10 },
  tabs: { flexDirection: 'row', backgroundColor: '#f5ede3', borderRadius: 12, padding: 4, marginBottom: 20 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabBtnAtivo: { backgroundColor: '#fff', elevation: 2 },
  tabBtnTexto: { fontSize: 14, fontWeight: '600', color: '#8a6a4a' },
  tabBtnTextoAtivo: { color: COR.laranja },
  erroBox: { backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fecaca', borderRadius: 9, padding: 10, marginBottom: 14 },
  erroTexto: { color: '#b91c1c', fontSize: 13 },
  requisitoBox: { backgroundColor: '#fdf8f3', borderWidth: 1, borderColor: '#e8d5be', borderRadius: 10, padding: 12, marginBottom: 14 },
  requisitoLinha: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  requisitoTexto: { fontSize: 12, fontWeight: '500' },
  requisitoAtendido: { color: '#16a34a' },
  requisitoNaoAtendido: { color: '#9a7560' },
  campoWrap: { marginBottom: 14 },
  campoLabel: { fontSize: 11, fontWeight: '700', color: '#8a6a4a', marginBottom: 6, textTransform: 'uppercase' },
  campoLinha: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fdf8f3', borderWidth: 1.5, borderColor: '#e8d5be', borderRadius: 10 },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 10, fontSize: 15, color: COR.marrom },
  campoDirWrap: { paddingHorizontal: 12, justifyContent: 'center' },
  btnPrimario: { backgroundColor: COR.laranja, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  btnDesabilitado: { opacity: 0.5 },
  btnPrimarioTexto: { color: '#fff', fontWeight: '700', fontSize: 15 },
  mainSafe: { flex: 1, backgroundColor: COR.fundo },
  mainScroll: { padding: 16 },
  topBar: { backgroundColor: COR.laranjaEsc, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  topEmail: { flex: 1, color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' },
  btnSair: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  btnSairTexto: { color: '#fff', fontWeight: '700', fontSize: 13 },
  secaoTitulo: { fontSize: 17, fontWeight: '700', color: COR.marrom, marginBottom: 12, marginTop: 8 },
  listaHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 12 },
  contadorBadge: { backgroundColor: '#f5ede3', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  contadorTexto: { color: COR.laranja, fontSize: 12, fontWeight: '700' },
  formCard: { backgroundColor: COR.card, borderRadius: 16, padding: 16, elevation: 3 },
  linha2: { flexDirection: 'row' },
  seletorMaterial: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fdf8f3',
    borderWidth: 1.5,
    borderColor: '#e8d5be',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    marginBottom: 14,
  },
  seletorMaterialTexto: { flex: 1, fontSize: 15, color: COR.marrom },
  seletorMaterialIcone: { fontSize: 12, color: COR.laranja, fontWeight: '700' },
  modalListaBox: { backgroundColor: COR.card, borderRadius: 20, width: '90%', maxHeight: '70%', elevation: 12, overflow: 'hidden' },
  modalListaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  modalListaTitulo: { fontSize: 17, fontWeight: '700', color: COR.marrom },
  modalListaFechar: { fontSize: 18, color: '#aaa', fontWeight: '700' },
  modalListaScroll: { padding: 10 },
  modalListaItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 10, marginBottom: 4 },
  modalListaItemAtivo: { backgroundColor: '#fdf8f3' },
  modalListaItemTexto: { flex: 1, fontSize: 15, color: COR.marrom },
  modalListaItemTextoAtivo: { color: COR.laranja, fontWeight: '700' },
  modalListaItemCheck: { color: COR.laranja, fontSize: 16, fontWeight: '700' },
  totalBox: { backgroundColor: COR.laranja, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  totalSubLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  totalValor: { color: '#fff', fontSize: 22, fontWeight: '700' },
  modalListaItemSub: { fontSize: 12, color: '#8a6a4a', marginTop: 2 },
  btnSalvar: { backgroundColor: COR.marrom, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnSalvarTexto: { color: '#fff', fontWeight: '700', fontSize: 14 },
  itemCard: { backgroundColor: COR.card, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  itemInfo: { flex: 1 },
  itemTotal: { fontSize: 19, fontWeight: '700', color: COR.laranja, marginBottom: 4 },
  itemLinha: { fontSize: 13, color: '#7a5a3a', marginTop: 2 },
  itemAcoes: { alignItems: 'center', marginLeft: 10 },
  btnEnviarCard: { backgroundColor: COR.verdeClr, borderWidth: 1, borderColor: COR.verdeBorda, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center', marginBottom: 8 },
  btnEnviarCardTexto: { fontSize: 10, fontWeight: '700', color: COR.verde },
  btnDeletar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff0f0', borderWidth: 1, borderColor: '#fca5a5', alignItems: 'center', justifyContent: 'center' },
  btnDeletarTexto: { color: '#ef4444', fontSize: 15, fontWeight: '700' },
  toast: { position: 'absolute', bottom: 28, left: 20, right: 20, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, elevation: 8 },
  toastTexto: { color: '#fff', fontWeight: '600', fontSize: 14, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmBox: { backgroundColor: COR.card, borderRadius: 18, padding: 24, width: '100%', elevation: 10 },
  confirmTitulo: { fontSize: 17, fontWeight: '700', color: COR.marrom, textAlign: 'center', marginBottom: 8 },
  confirmMsg: { fontSize: 14, color: '#7a5a3a', textAlign: 'center', marginBottom: 24 },
  confirmBtns: { flexDirection: 'row' },
  btnCancelar: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#e8d5be', alignItems: 'center', marginRight: 8 },
  btnCancelarTexto: { fontSize: 14, fontWeight: '600', color: '#7a5a3a' },
  btnExcluir: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center' },
  btnExcluirTexto: { fontSize: 14, fontWeight: '600', color: '#fff' },
  enviarBox: { backgroundColor: COR.card, borderRadius: 20, padding: 22, width: '100%', elevation: 12 },
  enviarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  enviarTitulo: { fontSize: 17, fontWeight: '700', color: COR.marrom },
  enviarFechar: { fontSize: 18, color: '#aaa', fontWeight: '700' },
  abas: { flexDirection: 'row', backgroundColor: '#f5ede3', borderRadius: 10, padding: 4, marginBottom: 16 },
  abaBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  abaBtnAtiva: { backgroundColor: '#fff', elevation: 2 },
  abaBtnTexto: { fontSize: 13, fontWeight: '600', color: '#8a6a4a' },
  abaBtnTextoAtiva: { color: COR.laranja },
  enviarResumo: { backgroundColor: '#fdf8f3', borderRadius: 12, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: '#e8d5be' },
  enviarResumoLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  enviarResumoLabel: { fontSize: 12, color: '#8a6a4a', fontWeight: '600' },
  enviarResumoTotal: { fontSize: 20, fontWeight: '700', color: COR.laranja },
  enviarResumoDetalhe: { fontSize: 12, color: '#8a6a4a', lineHeight: 18 },
  enviarCampoLabel: { fontSize: 11, fontWeight: '700', color: '#8a6a4a', marginBottom: 6, textTransform: 'uppercase' },
  btnEnviar: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: COR.verde, alignItems: 'center' },
  btnEnviarTexto: { fontSize: 14, fontWeight: '700', color: '#fff' },
  telPrefixo: { paddingHorizontal: 12, fontSize: 14, fontWeight: '600', color: COR.marrom },
});
