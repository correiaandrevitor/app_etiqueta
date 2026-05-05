import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  Image,
  KeyboardAvoidingView,
  Platform,
  Dimensions
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: screenWidth } = Dimensions.get('window');
const AUTH_KEY = '@etiquetas:users';
const ETIQUETAS_KEY = '@etiquetas:orcamentos';
const CURRENT_USER_KEY = '@etiquetas:currentUser';

// ================================
// SERVIÇOS
// ================================
const AuthService = {
  async saveUser(email, password) {
    try {
      const users = await this.getUsers();
      const newUser = { email, password, id: Date.now().toString() };
      users.push(newUser);
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(users));
      return true;
    } catch (error) {
      return false;
    }
  },

  async getUsers() {
    try {
      const usersJson = await AsyncStorage.getItem(AUTH_KEY);
      return usersJson ? JSON.parse(usersJson) : [];
    } catch (error) {
      return [];
    }
  },

  async login(email, password) {
    try {
      const users = await this.getUsers();
      const user = users.find(u => u.email === email && u.password === password);
      if (user) {
        await AsyncStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  },

  async logout() {
    try {
      await AsyncStorage.removeItem(CURRENT_USER_KEY);
      return true;
    } catch (error) {
      return false;
    }
  },

  async isLoggedIn() {
    try {
      const user = await AsyncStorage.getItem(CURRENT_USER_KEY);
      return !!user;
    } catch (error) {
      return false;
    }
  }
};

const EtiquetaService = {
  async saveOrcamento(orcamento) {
    try {
      const orcamentos = await this.getOrcamentos();
      const newOrcamento = { ...orcamento, id: Date.now().toString() };
      orcamentos.push(newOrcamento);
      await AsyncStorage.setItem(ETIQUETAS_KEY, JSON.stringify(orcamentos));
      return newOrcamento;
    } catch (error) {
      return null;
    }
  },

  async getOrcamentos() {
    try {
      const orcamentosJson = await AsyncStorage.getItem(ETIQUETAS_KEY);
      return orcamentosJson ? JSON.parse(orcamentosJson) : [];
    } catch (error) {
      return [];
    }
  },

  async deleteOrcamento(id) {
    try {
      const orcamentos = await this.getOrcamentos();
      const filtered = orcamentos.filter(o => o.id !== id);
      await AsyncStorage.setItem(ETIQUETAS_KEY, JSON.stringify(filtered));
      return true;
    } catch (error) {
      return false;
    }
  }
};

// ================================
// TELA DE REGISTRO (CENTRALIZADA)
// ================================
const RegisterScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !password || !confirmEmail || !confirmPassword) {
      Alert.alert('Erro', 'Preencha todos os campos');
      return;
    }

    if (email !== confirmEmail) {
      Alert.alert('Erro', 'Emails não coincidem');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Erro', 'Senhas não coincidem');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Erro', 'Senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      const success = await AuthService.saveUser(email, password);
      if (success) {
        Alert.alert(
          '✅ Sucesso!',
          'Conta criada com sucesso!',
          [{ 
            text: 'Fazer Login',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }]
              });
            }
          }]
        );
        setEmail('');
        setPassword('');
        setConfirmEmail('');
        setConfirmPassword('');
      } else {
        Alert.alert('Erro', 'Erro ao criar conta. Tente novamente.');
      }
    } catch (error) {
      Alert.alert('Erro', 'Erro no registro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.contentCenter}>
          <Image 
            source={{ uri: 'https://img.freepik.com/vetores-gratis/icone-de-registro-de-usuario_1284-6106.jpg' }} 
            style={styles.headerImage} 
            resizeMode="contain" 
          />
          
          <Text style={styles.title}>👤 Criar Conta</Text>
          <Text style={styles.subtitle}>Crie sua conta gratuita</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Email *"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Confirme Email *"
              value={confirmEmail}
              onChangeText={setConfirmEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Senha (mín. 6 caracteres) *"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TextInput
              style={styles.input}
              placeholder="Confirme Senha *"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>📝 CRIAR CONTA</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.switchContainer}>
            <Text style={styles.switchText}>Já tem conta? Entrar</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ================================
// TELA DE LOGIN (CENTRALIZADA)
// ================================
const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Erro', 'Preencha todos os campos');
      return;
    }

    setLoading(true);
    try {
      const success = await AuthService.login(email, password);
      if (success) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Etiquetas' }]
        });
      } else {
        Alert.alert('Erro', 'Email ou senha incorretos');
      }
    } catch (error) {
      Alert.alert('Erro', 'Erro no login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.contentCenter}>
          <Image 
            source={{ uri: 'https://img.freepik.com/vetores-gratis/icone-de-login-do-perfil-do-usuario_1284-6105.jpg' }} 
            style={styles.headerImage} 
            resizeMode="contain" 
          />
          
          <Text style={styles.title}>🏷️ Etiquetas Pro</Text>
          <Text style={styles.subtitle}>Faça login na sua conta</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Senha"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>🚀 ENTRAR</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.switchContainer}>
            <Text style={styles.switchText}>Não tem conta? Criar agora</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ================================
// TELA DE ETIQUETAS (CENTRALIZADA)
// ================================
const EtiquetasScreen = ({ navigation }) => {
  const [orcamento, setOrcamento] = useState({
    quantidade: '',
    tamanho: '',
    material: '',
    impressao: '',
    precoUnitario: '',
    total: '0,00'
  });
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadOrcamentos();
  }, []);

  const loadOrcamentos = async () => {
    const lista = await EtiquetaService.getOrcamentos();
    setOrcamentos(lista);
  };

  const calcularTotal = () => {
    const qtd = parseFloat(orcamento.quantidade) || 0;
    const preco = parseFloat(orcamento.precoUnitario.replace(',', '.')) || 0;
    const total = (qtd * preco).toLocaleString('pt-BR', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    setOrcamento({ ...orcamento, total });
  };

  const salvarOrcamento = async () => {
    if (!orcamento.quantidade || !orcamento.tamanho || !orcamento.material) {
      Alert.alert('Erro', 'Preencha os campos obrigatórios');
      return;
    }

    setLoading(true);
    const saved = await EtiquetaService.saveOrcamento(orcamento);
    if (saved) {
      Alert.alert('✅ Sucesso', 'Orçamento salvo!');
      setOrcamento({
        quantidade: '',
        tamanho: '',
        material: '',
        impressao: '',
        precoUnitario: '',
        total: '0,00'
      });
      loadOrcamentos();
    }
    setLoading(false);
  };

  const deleteOrcamento = (id) => {
    Alert.alert(
      'Confirmar',
      'Deseja realmente excluir este orçamento?',
      [
        { text: 'Cancelar' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const success = await EtiquetaService.deleteOrcamento(id);
            if (success) {
              loadOrcamentos();
              Alert.alert('✅ Sucesso', 'Orçamento excluído!');
            }
          }
        }
      ]
    );
  };

  const renderOrcamento = ({ item }) => (
    <View style={styles.orcamentoItem}>
      <Text style={styles.orcamentoTitle}>💰 Orçamento #{item.id.slice(-6)}</Text>
      <Text>📊 Qtd: {item.quantidade}</Text>
      <Text>📏 Tamanho: {item.tamanho}</Text>
      <Text>🧾 Material: {item.material}</Text>
      {item.impressao && <Text>🖨️ Impressão: {item.impressao}</Text>}
      <Text style={styles.preco}>💵 Total: R$ {item.total}</Text>
      <TouchableOpacity 
        style={styles.deleteBtn} 
        onPress={() => deleteOrcamento(item.id)}
      >
        <Text style={styles.deleteText}>🗑️ EXCLUIR</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📋 Novo Orçamento</Text>
          <TouchableOpacity 
            style={styles.logoutBtn} 
            onPress={async () => {
              await AuthService.logout();
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }]
              });
            }}
          >
            <Text style={styles.logoutText}>🚪 SAIR</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Quantidade *"
              value={orcamento.quantidade}
              onChangeText={(text) => {
                const numericText = text.replace(/[^0-9]/g, '');
                setOrcamento({ ...orcamento, quantidade: numericText });
                calcularTotal();
              }}
              keyboardType="number-pad"
              textContentType="telephoneNumber"
              maxLength={10}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Tamanho (ex: 5x3cm) *"
              value={orcamento.tamanho}
              onChangeText={(text) => setOrcamento({ ...orcamento, tamanho: text })}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Material *"
              value={orcamento.material}
              onChangeText={(text) => setOrcamento({ ...orcamento, material: text })}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Tipo de Impressão"
              value={orcamento.impressao}
              onChangeText={(text) => setOrcamento({ ...orcamento, impressao: text })}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Preço Unitário (ex: 0,50)"
              value={orcamento.precoUnitario}
              onChangeText={(text) => {
                const cleanText = text.replace(/[^0-9,.]/g, '');
                const parts = cleanText.split(/[,.]/);
                if (parts.length > 2) {
                  const formatted = parts[0] + ',' + parts.slice(1).join('');
                  setOrcamento({ ...orcamento, precoUnitario: formatted });
                } else {
                  setOrcamento({ ...orcamento, precoUnitario: cleanText });
                }
                calcularTotal();
              }}
              keyboardType="number-pad"
              textContentType="none"
              returnKeyType="done"
              maxLength={12}
            />
            
            <Text style={styles.total}>💰 Total: R$ {orcamento.total}</Text>
            
            <TouchableOpacity 
              style={[styles.saveBtn, loading && styles.saveBtnDisabled]} 
              onPress={salvarOrcamento}
              disabled={loading}
            >
              <Text style={styles.saveBtnText}>
                {loading ? 'Salvando...' : '💾 SALVAR ORÇAMENTO'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.orcamentosList}>
          <Text style={styles.sectionTitle}>
            📋 Orçamentos Salvos ({orcamentos.length})
          </Text>
          {orcamentos.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhum orçamento salvo ainda</Text>
              <Text style={styles.emptySubtext}>Crie seu primeiro orçamento acima!</Text>
            </View>
          ) : (
            <FlatList
              data={orcamentos}
              renderItem={renderOrcamento}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ================================
// APP PRINCIPAL
// ================================
const Stack = createStackNavigator();

export default function App() {
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => setInitialLoading(false), 1500);
  }, []);

  if (initialLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.container, styles.center]}>
          <Image 
            source={{ uri: 'https://img.freepik.com/vetores-gratis/ilustracao-do-conceito-de-etiqueta_114360-4245.jpg' }} 
            style={styles.splashImage} 
          />
          <ActivityIndicator size="large" color="#007AFF" style={styles.splashLoader} />
          <Text style={styles.loadingText}>Carregando Etiquetas Pro...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Login"
        screenOptions={{ 
          headerShown: false,
          gestureEnabled: true
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="Etiquetas" component={EtiquetasScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ================================
// ESTILOS (TUDO CENTRALIZADO)
// ================================
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  contentCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 400,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  headerImage: {
    width: 100,
    height: 100,
    marginBottom: 20,
  },
  splashImage: {
    width: 180,
    height: 180,
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 32,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  switchContainer: {
    alignItems: 'center',
  },
  switchText: {
    textAlign: 'center',
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 20,
    marginTop: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  logoutBtn: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
  },
  logoutText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  formContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  form: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    padding: 24,
  },
  total: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#34C759',
    textAlign: 'center',
    marginVertical: 20,
    backgroundColor: '#f0f8ff',
    padding: 16,
    borderRadius: 12,
  },
  saveBtn: {
    backgroundColor: '#34C759',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  saveBtnDisabled: {
    backgroundColor: '#9E9E9E',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  orcamentosList: {
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
    textAlign: 'center',
  },
  orcamentoItem: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orcamentoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  preco: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#34C759',
    marginTop: 8,
    marginBottom: 12,
  },
  deleteBtn: {
    backgroundColor: '#FF3B30',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyState: {
    backgroundColor: '#fff',
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  splashLoader: {
    marginTop: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
