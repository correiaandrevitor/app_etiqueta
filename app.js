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
// BANCO DE DADOS — AsyncStorage
// ─────────────────────────────────────────────
const DB = {
  async get(tabela) {
    try {
      const raw = await AsyncStorage.getItem('@db:' + tabela);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },
  async set(tabela, dados) {
    try {
      await AsyncStorage.setItem('@db:' + tabela, JSON.stringify(dados));
    } catch (e) {}
  },
};

// ─────────────────────────────────────────────
// AUTH SERVICE
// ─────────────────────────────────────────────
const AuthService = {
  currentUser: null,

  _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  },

  async register(email, senha) {
    const users = await DB.get('users');
    const chave = email.toLowerCase().trim();
    if (users[chave]) return { ok: false, erro: 'E-mail já cadastrado' };
    users[chave] = {
      id: Date.now().toString(),
      email: chave,
      hash: this._hash(senha + chave),
      criadoEm: new Date().toISOString(),
    };
    await DB.set('users', users);
    return { ok: true };
  },

  async login(email, senha) {
    const users = await DB.get('users');
    const chave = email.toLowerCase().trim();
    if (!users[chave]) return { ok: false, erro: 'Usuário não cadastrado' };
    if (users[chave].hash !== this._hash(senha + chave))
      return { ok: false, erro: 'Senha incorreta' };
    this.currentUser = { id: users[chave].id, email: chave };
    return { ok: true, user: this.currentUser };
  },

  logout() { this.currentUser = null; },
};

// ─────────────────────────────────────────────
// ORÇAMENTO SERVICE
// ─────────────────────────────────────────────
const OrcService = {
  async salvar(userId, orc) {
    const dados = await DB.get('orcamentos');
    const id = Date.now().toString();
    dados[id] = {
      id,
      userId,
      quantidade: parseFloat(orc.quantidade) || 0,
      tamanho:    orc.tamanho   || '',
      material:   orc.material  || '',
      impressao:  orc.impressao || '',
      precoUnit:  parseFloat(orc.precoUnit)  || 0,
      total:      parseFloat(orc.total)      || 0,
      criadoEm:   new Date().toISOString(),
    };
    await DB.set('orcamentos', dados);
    return { ok: true };
  },

  async listar(userId) {
    const dados = await DB.get('orcamentos');
    return Object.values(dados)
      .filter(o => o.userId === userId)
      .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
  },

  async deletar(id, userId) {
    const dados = await DB.get('orcamentos');
    if (!dados[id] || dados[id].userId !== userId)
      return { ok: false, erro: 'Não autorizado' };
    delete dados[id];
    await DB.set('orcamentos', dados);
    return { ok: true };
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

  const bg = tipo === 'sucesso' ? '#15803d' : '#b91c1c';
  const icone = tipo === 'sucesso' ? '✓  ' : '⚠  ';

  return (
    <Animated.View style={[st.toast, { backgroundColor: bg, opacity: opacidade }]}>
      <Text style={st.toastTexto}>{icone}{mensagem}</Text>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
// COMPONENTE: MODAL DE CONFIRMAÇÃO (EXCLUSÃO)
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
// COMPONENTE: MODAL ENVIAR ORÇAMENTO (WHATSAPP)
// ─────────────────────────────────────────────
function ModalEnviar({ visivel, item, remetente, aoFechar, aoToast }) {
  const [telefone, setTelefone] = useState('');
  const [enviando, setEnviando] = useState(false);

  const fmtValor = (n) => 'R$ ' + Number(n).toFixed(2).replace('.', ',');
  const fmtData  = (iso) => new Date(iso).toLocaleDateString('pt-BR');

  const limparEFechar = () => {
    setTelefone('');
    aoFechar();
  };

  // Mantém apenas dígitos no campo de telefone
  const aoMudarTelefone = (texto) => {
    setTelefone(texto.replace(/\D/g, ''));
  };

  // Formata para exibição: (11) 91234-5678
  const telefoneFormatado = () => {
    const d = telefone;
    if (d.length <= 2)  return d.length ? '(' + d : '';
    if (d.length <= 6)  return '(' + d.slice(0,2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0,2) + ') ' + d.slice(2,6) + '-' + d.slice(6);
    return '(' + d.slice(0,2) + ') ' + d.slice(2,7) + '-' + d.slice(7,11);
  };

  const enviarWhatsApp = async () => {
    if (telefone.length < 10) {
      aoToast('Informe um número com DDD (mínimo 10 dígitos)', 'erro');
      return;
    }

    setEnviando(true);

    // Número no formato internacional Brasil: 55 + DDD + número
    const numeroIntl = '55' + telefone;

    const linhas = [
      '🏷️ *Orçamento de Etiquetas*',
      '',
      '━━━━━━━━━━━━━━━━━━━━━',
      item.tamanho   ? '📐 *Tamanho:*    ' + item.tamanho   : null,
      item.material  ? '🧾 *Material:*   ' + item.material  : null,
      item.impressao ? '🖨 *Impressão:*  ' + item.impressao : null,
      '📦 *Quantidade:* ' + item.quantidade + ' unidades',
      '💲 *Preço unit.:* ' + fmtValor(item.precoUnit),
      '━━━━━━━━━━━━━━━━━━━━━',
      '💰 *TOTAL: ' + fmtValor(item.total) + '*',
      '━━━━━━━━━━━━━━━━━━━━━',
      '',
      '📅 Data: ' + fmtData(item.criadoEm),
      '',
      '_Atenciosamente,_',
      '_' + remetente + '_',
    ].filter(l => l !== null);

    const mensagem = encodeURIComponent(linhas.join('\n'));
    const url = 'whatsapp://send?phone=' + numeroIntl + '&text=' + mensagem;
    const urlFallback = 'https://wa.me/' + numeroIntl + '?text=' + mensagem;

    try {
      const podeNativo = await Linking.canOpenURL(url);
      if (podeNativo) {
        await Linking.openURL(url);
      } else {
        // Fallback para wa.me (funciona mesmo sem app instalado via browser)
        await Linking.openURL(urlFallback);
      }
      aoToast('WhatsApp aberto com o orçamento!');
      limparEFechar();
    } catch (e) {
      aoToast('Erro ao abrir WhatsApp', 'erro');
    } finally {
      setEnviando(false);
    }
  };

  if (!item) return null;

  return (
    <Modal transparent animationType="slide" visible={visivel} onRequestClose={limparEFechar}>
      <View style={st.overlay}>
        <View style={st.enviarBox}>
          {/* Cabeçalho */}
          <View style={st.enviarHeader}>
            <Text style={st.enviarTitulo}>💬  Enviar pelo WhatsApp</Text>
            <TouchableOpacity onPress={limparEFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={st.enviarFechar}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Resumo do orçamento */}
          <View style={st.enviarResumo}>
            <View style={st.enviarResumoLinha}>
              <Text style={st.enviarResumoLabel}>Total</Text>
              <Text style={st.enviarResumoTotal}>{fmtValor(item.total)}</Text>
            </View>
            <Text style={st.enviarResumoDetalhe}>
              {item.quantidade} un × {fmtValor(item.precoUnit)}
              {item.tamanho  ? '  •  ' + item.tamanho  : ''}
              {item.material ? '  •  ' + item.material : ''}
            </Text>
          </View>

          {/* Campo telefone */}
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
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={16}
            />
          </View>

          <Text style={st.enviarDica}>
            O WhatsApp será aberto com o orçamento formatado e pronto para enviar.
          </Text>

          {/* Botões */}
          <View style={st.confirmBtns}>
            <TouchableOpacity style={st.btnCancelar} onPress={limparEFechar} activeOpacity={0.8}>
              <Text style={st.btnCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.btnEnviar, enviando && st.btnDesabilitado]}
              onPress={enviarWhatsApp}
              disabled={enviando}
              activeOpacity={0.85}
            >
              {enviando
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={st.btnEnviarTexto}>Enviar  💬</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
          autoCorrect={false}
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
  const [confirmEmail, setConfirmEmail]         = useState('');
  const [senha, setSenha]                       = useState('');
  const [confirmSenha, setConfirmSenha]         = useState('');
  const [mostrarSenha, setMostrarSenha]         = useState(false);
  const [mostrarConfSenha, setMostrarConfSenha] = useState(false);
  const [carregando, setCarregando]             = useState(false);
  const [erroMsg, setErroMsg]                   = useState('');
  const [okMsg, setOkMsg]                       = useState('');

  const trocarModo = (paraLogin) => {
    setModoLogin(paraLogin);
    setErroMsg('');
    setOkMsg('');
    setEmail('');
    setSenha('');
    setConfirmEmail('');
    setConfirmSenha('');
    setMostrarSenha(false);
    setMostrarConfSenha(false);
  };

  const enviar = async () => {
    setErroMsg('');
    setOkMsg('');

    if (!email.trim() || !senha.trim()) {
      setErroMsg('Preencha todos os campos obrigatórios');
      return;
    }
    if (senha.length < 6) {
      setErroMsg('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setCarregando(true);
    try {
      if (!modoLogin) {
        // Validações exclusivas do cadastro
        if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
          setErroMsg('Os e-mails não coincidem');
          return;
        }
        if (senha !== confirmSenha) {
          setErroMsg('As senhas não coincidem');
          return;
        }
        const res = await AuthService.register(email, senha);
        if (res.ok) {
          setOkMsg('Conta criada com sucesso! Faça login.');
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
      setErroMsg('Erro inesperado. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  };

  // Botão de olho reutilizável
  const BotaoOlho = ({ mostrar, aoAlternar }) => (
    <TouchableOpacity
      onPress={aoAlternar}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Text style={{ fontSize: 18 }}>{mostrar ? '🙈' : '👁️'}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={st.loginSafe}>
      <StatusBar barStyle="light-content" backgroundColor={COR.laranjaEsc} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={st.loginScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={st.logoArea}>
            <View style={st.logoBox}>
              <Text style={st.logoEmoji}>🏷️</Text>
            </View>
            <Text style={st.appTitulo}>EtiquetaFácil</Text>
            <Text style={st.appSub}>Orçamentos de etiquetas</Text>
          </View>

          {/* Card */}
          <View style={st.loginCard}>

            {/* Tabs */}
            <View style={st.tabs}>
              <TouchableOpacity
                style={[st.tabBtn, modoLogin && st.tabBtnAtivo]}
                onPress={() => trocarModo(true)}
                activeOpacity={0.8}
              >
                <Text style={[st.tabBtnTexto, modoLogin && st.tabBtnTextoAtivo]}>Entrar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.tabBtn, !modoLogin && st.tabBtnAtivo]}
                onPress={() => trocarModo(false)}
                activeOpacity={0.8}
              >
                <Text style={[st.tabBtnTexto, !modoLogin && st.tabBtnTextoAtivo]}>Cadastrar</Text>
              </TouchableOpacity>
            </View>

            {/* Mensagens de feedback */}
            {!!erroMsg && (
              <View style={st.erroBox}>
                <Text style={st.erroTexto}>⚠  {erroMsg}</Text>
              </View>
            )}
            {!!okMsg && (
              <View style={st.okBox}>
                <Text style={st.okTexto}>✓  {okMsg}</Text>
              </View>
            )}

            {/* ── CAMPO: E-MAIL ── */}
            <Campo
              label="E-mail"
              valor={email}
              aoMudar={setEmail}
              placeholder="seu@email.com"
              teclado="email-address"
            />

            {/* ── CAMPO: CONFIRMAR E-MAIL (só no cadastro) ── */}
            {!modoLogin && (
              <Campo
                label="Confirmar e-mail"
                valor={confirmEmail}
                aoMudar={setConfirmEmail}
                placeholder="repita o e-mail"
                teclado="email-address"
              />
            )}

            {/* ── CAMPO: SENHA ── */}
            <Campo
              label="Senha"
              valor={senha}
              aoMudar={setSenha}
              placeholder="mínimo 6 caracteres"
              senha={!mostrarSenha}
              iconeDir={
                <BotaoOlho
                  mostrar={mostrarSenha}
                  aoAlternar={() => setMostrarSenha(v => !v)}
                />
              }
            />

            {/* ── CAMPO: CONFIRMAR SENHA (só no cadastro) ── */}
            {!modoLogin && (
              <Campo
                label="Confirmar senha"
                valor={confirmSenha}
                aoMudar={setConfirmSenha}
                placeholder="repita a senha"
                senha={!mostrarConfSenha}
                iconeDir={
                  <BotaoOlho
                    mostrar={mostrarConfSenha}
                    aoAlternar={() => setMostrarConfSenha(v => !v)}
                  />
                }
              />
            )}

            {/* Botão principal */}
            <TouchableOpacity
              style={[st.btnPrimario, carregando && st.btnDesabilitado]}
              onPress={enviar}
              disabled={carregando}
              activeOpacity={0.85}
            >
              {carregando
                ? <ActivityIndicator color="#fff" />
                : <Text style={st.btnPrimarioTexto}>
                    {modoLogin ? 'ENTRAR' : 'CRIAR CONTA'}
                  </Text>
              }
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// TELA PRINCIPAL — ORÇAMENTOS
// ─────────────────────────────────────────────
const FORM_VAZIO = {
  quantidade: '',
  tamanho:    '',
  material:   '',
  impressao:  '',
  precoUnit:  '',
  total:      '0,00',
};

function TelaOrcamentos({ user, aoSair }) {
  const [form, setForm]             = useState(FORM_VAZIO);
  const [lista, setLista]           = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [toast, setToast]           = useState(null);
  const [confirmar, setConfirmar]   = useState(null);
  const [enviarItem, setEnviarItem] = useState(null); // item sendo enviado

  useEffect(() => { carregarLista(); }, []);

  const carregarLista = async () => {
    const items = await OrcService.listar(user.id);
    setLista(items);
  };

  const exibirToast = (mensagem, tipo = 'sucesso') => setToast({ mensagem, tipo });

  const atualizarCampo = (campo, valor) => {
    setForm(prev => {
      const novo  = { ...prev, [campo]: valor };
      const qtd   = parseFloat(novo.quantidade.replace(',', '.')) || 0;
      const preco = parseFloat(novo.precoUnit.replace(',', '.'))  || 0;
      novo.total  = (qtd * preco).toFixed(2).replace('.', ',');
      return novo;
    });
  };

  const salvar = async () => {
    if (!form.quantidade || !form.precoUnit) {
      exibirToast('Informe quantidade e preço unitário', 'erro');
      return;
    }
    setCarregando(true);
    try {
      const res = await OrcService.salvar(user.id, {
        ...form,
        total: parseFloat(form.total.replace(',', '.')) || 0,
      });
      if (res.ok) {
        exibirToast('Orçamento salvo com sucesso!');
        setForm(FORM_VAZIO);
        await carregarLista();
      } else {
        exibirToast(res.erro, 'erro');
      }
    } catch (e) {
      exibirToast('Erro ao salvar orçamento', 'erro');
    } finally {
      setCarregando(false);
    }
  };

  const pedirDelecao = (id) => {
    setConfirmar({
      mensagem: 'Deseja realmente excluir este orçamento?',
      aoConfirmar: async () => {
        setConfirmar(null);
        const res = await OrcService.deletar(id, user.id);
        if (res.ok) {
          exibirToast('Orçamento excluído');
          await carregarLista();
        } else {
          exibirToast(res.erro, 'erro');
        }
      },
    });
  };

  const formatarData  = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formatarValor = (n)   => Number(n).toFixed(2).replace('.', ',');

  return (
    <SafeAreaView style={st.mainSafe}>
      <StatusBar barStyle="light-content" backgroundColor={COR.laranjaEsc} />

      {/* Barra de topo */}
      <View style={st.topBar}>
        <Text style={st.topEmail} numberOfLines={1}>{user.email}</Text>
        <TouchableOpacity style={st.btnSair} onPress={aoSair} activeOpacity={0.8}>
          <Text style={st.btnSairTexto}>Sair</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={st.mainScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── FORMULÁRIO ── */}
          <Text style={st.secaoTitulo}>Novo Orçamento</Text>
          <View style={st.formCard}>

            <View style={st.linha2}>
              <View style={{ flex: 1 }}>
                <Campo label="Quantidade" valor={form.quantidade} aoMudar={v => atualizarCampo('quantidade', v)} placeholder="ex: 1000" teclado="numeric" />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <Campo label="Tamanho" valor={form.tamanho} aoMudar={v => atualizarCampo('tamanho', v)} placeholder="ex: 10x5cm" />
              </View>
            </View>

            <View style={st.linha2}>
              <View style={{ flex: 1 }}>
                <Campo label="Material" valor={form.material} aoMudar={v => atualizarCampo('material', v)} placeholder="ex: BOPP" />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <Campo label="Impressão" valor={form.impressao} aoMudar={v => atualizarCampo('impressao', v)} placeholder="ex: 4 cores" />
              </View>
            </View>

            <Campo label="Preço Unitário (R$)" valor={form.precoUnit} aoMudar={v => atualizarCampo('precoUnit', v)} placeholder="ex: 0.25" teclado="numeric" />

            <View style={st.totalBox}>
              <Text style={st.totalLabel}>Total</Text>
              <Text style={st.totalValor}>R$ {form.total}</Text>
            </View>

            <TouchableOpacity
              style={[st.btnSalvar, carregando && st.btnDesabilitado]}
              onPress={salvar}
              disabled={carregando}
              activeOpacity={0.85}
            >
              {carregando
                ? <ActivityIndicator color="#fff" />
                : <Text style={st.btnSalvarTexto}>💾  SALVAR ORÇAMENTO</Text>
              }
            </TouchableOpacity>
          </View>

          {/* ── LISTA ── */}
          <View style={st.listaHeader}>
            <Text style={st.secaoTitulo}>Orçamentos Salvos</Text>
            <View style={st.contadorBadge}>
              <Text style={st.contadorTexto}>{lista.length}</Text>
            </View>
          </View>

          {lista.length === 0 ? (
            <View style={st.estadoVazio}>
              <Text style={st.estadoVazioIcone}>📋</Text>
              <Text style={st.estadoVazioTexto}>Nenhum orçamento salvo ainda</Text>
            </View>
          ) : (
            lista.map(item => (
              <View key={item.id} style={st.itemCard}>

                {/* Informações */}
                <View style={st.itemInfo}>
                  <Text style={st.itemTotal}>R$ {formatarValor(item.total)}</Text>
                  <Text style={st.itemLinha}>
                    Qtd: {item.quantidade}  ×  R$ {formatarValor(item.precoUnit)}
                  </Text>
                  {!!item.tamanho   && <Text style={st.itemLinha}>📐  {item.tamanho}</Text>}
                  {!!item.material  && <Text style={st.itemLinha}>🧾  {item.material}</Text>}
                  {!!item.impressao && <Text style={st.itemLinha}>🖨  {item.impressao}</Text>}
                  <Text style={st.itemData}>{formatarData(item.criadoEm)}</Text>
                </View>

                {/* Ações */}
                <View style={st.itemAcoes}>
                  {/* Botão Enviar */}
                  <TouchableOpacity
                    style={st.btnEnviarCard}
                    onPress={() => setEnviarItem(item)}
                    activeOpacity={0.75}
                  >
                    <Text style={st.btnEnviarCardIcone}>✉</Text>
                    <Text style={st.btnEnviarCardTexto}>Enviar</Text>
                  </TouchableOpacity>

                  {/* Botão Excluir */}
                  <TouchableOpacity
                    style={st.btnDeletar}
                    onPress={() => pedirDelecao(item.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={st.btnDeletarTexto}>✕</Text>
                  </TouchableOpacity>
                </View>

              </View>
            ))
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Toast */}
      {!!toast && (
        <Toast mensagem={toast.mensagem} tipo={toast.tipo} aoEsconder={() => setToast(null)} />
      )}

      {/* Modal: confirmar exclusão */}
      <ModalConfirmar
        visivel={!!confirmar}
        mensagem={confirmar ? confirmar.mensagem : ''}
        aoConfirmar={confirmar ? confirmar.aoConfirmar : () => {}}
        aoCancelar={() => setConfirmar(null)}
      />

      {/* Modal: enviar orçamento */}
      <ModalEnviar
        visivel={!!enviarItem}
        item={enviarItem}
        remetente={user.email}
        aoFechar={() => setEnviarItem(null)}
        aoToast={exibirToast}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// APP PRINCIPAL
// ─────────────────────────────────────────────
export default function App() {
  const [tela, setTela] = useState('login');
  const [user, setUser] = useState(null);

  if (tela === 'login') {
    return (
      <TelaLogin aoLogar={(u) => { setUser(u); setTela('orcamentos'); }} />
    );
  }
  return (
    <TelaOrcamentos
      user={user}
      aoSair={() => { AuthService.logout(); setUser(null); setTela('login'); }}
    />
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const st = StyleSheet.create({

  // ── LOGIN ──────────────────────────────────
  loginSafe: { flex: 1, backgroundColor: COR.laranjaEsc },
  loginScroll: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 40 },

  logoArea: { alignItems: 'center', marginBottom: 28 },
  logoBox: {
    width: 84, height: 84, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
  },
  logoEmoji: { fontSize: 38 },
  appTitulo: { fontSize: 26, fontWeight: '700', color: '#fff' },
  appSub:    { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },

  loginCard: {
    backgroundColor: COR.card, borderRadius: 22, padding: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
  },

  tabs: {
    flexDirection: 'row', backgroundColor: '#f5ede3',
    borderRadius: 12, padding: 4, marginBottom: 20,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabBtnAtivo: {
    backgroundColor: '#fff',
    shadowColor: COR.laranja, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2,
  },
  tabBtnTexto:      { fontSize: 14, fontWeight: '600', color: '#8a6a4a' },
  tabBtnTextoAtivo: { color: COR.laranja },

  erroBox: {
    backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fecaca',
    borderRadius: 9, padding: 10, marginBottom: 14,
  },
  erroTexto: { color: '#b91c1c', fontSize: 13 },

  okBox: {
    backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0',
    borderRadius: 9, padding: 10, marginBottom: 14,
  },
  okTexto: { color: '#15803d', fontSize: 13 },

  // ── INPUTS ──────────────────────────────────
  campoWrap:  { marginBottom: 14 },
  campoLabel: {
    fontSize: 11, fontWeight: '700', color: '#8a6a4a',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  campoLinha: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fdf8f3', borderWidth: 1.5,
    borderColor: '#e8d5be', borderRadius: 10,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    fontSize: 15, color: COR.marrom,
  },
  campoDirWrap: { paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },

  btnPrimario: {
    backgroundColor: COR.laranja, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 6,
  },
  btnDesabilitado: { opacity: 0.5 },
  btnPrimarioTexto: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },

  // ── TELA PRINCIPAL ──────────────────────────
  mainSafe:   { flex: 1, backgroundColor: COR.fundo },
  mainScroll: { padding: 16 },

  topBar: {
    backgroundColor: COR.laranjaEsc, flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13,
  },
  topEmail: { flex: 1, color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500', marginRight: 10 },
  btnSair: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  btnSairTexto: { color: '#fff', fontWeight: '700', fontSize: 13 },

  secaoTitulo: { fontSize: 17, fontWeight: '700', color: COR.marrom, marginBottom: 12, marginTop: 8 },
  listaHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 12 },
  contadorBadge: {
    backgroundColor: '#f5ede3', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8,
  },
  contadorTexto: { color: COR.laranja, fontSize: 12, fontWeight: '700' },

  formCard: {
    backgroundColor: COR.card, borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  linha2: { flexDirection: 'row' },

  totalBox: {
    backgroundColor: COR.laranja, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16, marginVertical: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
  totalValor: { color: '#fff', fontSize: 22, fontWeight: '700' },

  btnSalvar: { backgroundColor: COR.marrom, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnSalvarTexto: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.4 },

  estadoVazio: { alignItems: 'center', paddingVertical: 50 },
  estadoVazioIcone: { fontSize: 42, marginBottom: 10 },
  estadoVazioTexto: { color: '#b08060', fontSize: 14 },

  // ── CARD DE ITEM ────────────────────────────
  itemCard: {
    backgroundColor: COR.card, borderRadius: 14, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  itemInfo:  { flex: 1 },
  itemTotal: { fontSize: 19, fontWeight: '700', color: COR.laranja, marginBottom: 4 },
  itemLinha: { fontSize: 13, color: '#7a5a3a', marginTop: 2 },
  itemData:  { fontSize: 11, color: '#bba080', marginTop: 8, fontStyle: 'italic' },

  itemAcoes: { alignItems: 'center', marginLeft: 10 },

  btnEnviarCard: {
    backgroundColor: COR.verdeClr,
    borderWidth: 1, borderColor: COR.verdeBorda,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    alignItems: 'center', marginBottom: 8, minWidth: 62,
  },
  btnEnviarCardIcone: { fontSize: 16, color: COR.verde },
  btnEnviarCardTexto: { fontSize: 10, fontWeight: '700', color: COR.verde, marginTop: 2 },

  btnDeletar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff0f0', borderWidth: 1, borderColor: '#fca5a5',
    alignItems: 'center', justifyContent: 'center',
  },
  btnDeletarTexto: { color: '#ef4444', fontSize: 15, fontWeight: '700' },

  // ── TOAST ──────────────────────────────────
  toast: {
    position: 'absolute', bottom: 28, left: 20, right: 20,
    borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 8,
  },
  toastTexto: { color: '#fff', fontWeight: '600', fontSize: 14, textAlign: 'center' },

  // ── MODAIS ─────────────────────────────────
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },

  // Modal excluir
  confirmBox: {
    backgroundColor: COR.card, borderRadius: 18, padding: 24, width: '100%',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
  },
  confirmTitulo: { fontSize: 17, fontWeight: '700', color: COR.marrom, textAlign: 'center', marginBottom: 8 },
  confirmMsg:    { fontSize: 14, color: '#7a5a3a', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  confirmBtns:   { flexDirection: 'row' },
  btnCancelar: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#e8d5be', alignItems: 'center', marginRight: 8,
  },
  btnCancelarTexto: { fontSize: 14, fontWeight: '600', color: '#7a5a3a' },
  btnExcluir: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#ef4444', alignItems: 'center',
  },
  btnExcluirTexto: { fontSize: 14, fontWeight: '600', color: '#fff' },

  // Modal enviar
  enviarBox: {
    backgroundColor: COR.card, borderRadius: 20, padding: 22, width: '100%',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, elevation: 12,
  },
  enviarHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  enviarTitulo: { fontSize: 17, fontWeight: '700', color: COR.marrom },
  enviarFechar: { fontSize: 18, color: '#aaa', fontWeight: '700' },

  enviarResumo: {
    backgroundColor: '#fdf8f3', borderRadius: 12,
    padding: 14, marginBottom: 18,
    borderWidth: 1, borderColor: '#e8d5be',
  },
  enviarResumoLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  enviarResumoLabel: { fontSize: 12, color: '#8a6a4a', fontWeight: '600' },
  enviarResumoTotal: { fontSize: 20, fontWeight: '700', color: COR.laranja },
  enviarResumoDetalhe: { fontSize: 12, color: '#8a6a4a', lineHeight: 18 },

  enviarCampoLabel: {
    fontSize: 11, fontWeight: '700', color: '#8a6a4a',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  enviarDica: { fontSize: 12, color: '#aaa', marginTop: 8, marginBottom: 20, lineHeight: 17 },

  btnEnviar: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: COR.verde, alignItems: 'center',
  },
  btnEnviarTexto: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
