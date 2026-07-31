import React, { useState, useRef, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// =====================================================================
// 🚨 CONFIGURACIÓN DEFINITIVA DE FIREBASE (NUEVO PROYECTO) 🚨
// =====================================================================
const myFirebaseConfig = {
  apiKey: "AIzaSyCA7pcyRFxbLAMq371YOFrf0fcl_kIg2mg",
  authDomain: "sistemaaporteslive.firebaseapp.com",
  projectId: "sistemaaporteslive",
  storageBucket: "sistemaaporteslive.firebasestorage.app",
  messagingSenderId: "750492010977",
  appId: "1:750492010977:web:c00f6b868749fa890deaa0"
};
// =====================================================================

// Inicialización segura de Firebase
let app: any;
let auth: any;
let db: any;

try {
  app = initializeApp(myFirebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
  console.error('Error inicializando Firebase:', error);
}

// Interfaces de Datos
interface Client {
  id: string;
  nombres: string;
  docIdentidad: string;
  ejecutivoCartera: string;
  tipoPlan: string;
  estadoActivo: string;
  grupoCodigo: string;
  estadoPlan: string;
  formaAdjudicacion?: string;
  fechaAdjudicacion?: string;
  numeroAsamblea?: string;
  fechaEntrega?: string;
  montoContratado: number;
  valorInscripcion: number;
  plazoPlan: number;
  valorCuota: number;
  cuotasPagadas: number;
  valorTotalPagado: number;
  fechaPrimerPago: string;
  vencidasExcel?: number;
  valorEntrada?: number;
}

interface MoraParam {
  diasMin: number;
  diasMax: number;
  tasaAnual: number;
}

interface CobranzaParam {
  saldoMin: number;
  saldoMax: number;
  valor: number;
}

interface CustomCuota {
  num: number;
  cuotaVal: number;
  abonoVal: number;
  vencimiento: string;
  fechaPago: string;
  estadoOverride?: string;
}

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState('base');
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' as 'success' | 'error' | 'info' });
  const [user, setUser] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [customCuotas, setCustomCuotas] = useState<Record<string, Record<number, CustomCuota>>>({});
  const [gestiones, setGestiones] = useState<Record<string, Array<{ fecha: string; texto: string }>>>({});
  const [descMora, setDescMora] = useState<Record<number, number>>({});
  const [descCobranza, setDescCobranza] = useState<Record<number, number>>({});
  
  const [fechaCalculoMora, setFechaCalculoMora] = useState(new Date().toISOString().split('T')[0]);
  const [moraParams, setMoraParams] = useState<MoraParam[]>([
    { diasMin: 1, diasMax: 15, tasaAnual: 5 },
    { diasMin: 16, diasMax: 30, tasaAnual: 7 },
    { diasMin: 31, diasMax: 60, tasaAnual: 9 },
    { diasMin: 61, diasMax: 9999, tasaAnual: 10 },
  ]);
  const [cobranzaParams, setCobranzaParams] = useState<CobranzaParam[]>([
    { saldoMin: 0, saldoMax: 19.99, valor: 3 },
    { saldoMin: 20, saldoMax: 39.99, valor: 5 },
    { saldoMin: 40, saldoMax: 59.99, valor: 9 },
    { saldoMin: 60, saldoMax: 79.99, valor: 12 },
    { saldoMin: 80, saldoMax: 99.99, valor: 15 },
    { saldoMin: 100, saldoMax: 999999, valor: 18 },
  ]);

  const [activeClientId, setActiveClientId] = useState('');
  const [searchQuery, setSearchInput] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [previewData, setPreviewData] = useState<any[]>([]);

  const [formData, setFormData] = useState<Partial<Client>>({
    id: '', nombres: '', docIdentidad: '', ejecutivoCartera: '', tipoPlan: 'Compra Planificada',
    estadoActivo: 'ACTIVO', grupoCodigo: '', estadoPlan: 'No Adjudicado', montoContratado: 0,
    valorInscripcion: 0, plazoPlan: 12, valorCuota: 0, cuotasPagadas: 0, valorTotalPagado: 0,
  });

  const [showMulticuotas, setShowMulticuotas] = useState(false);
  const [tipoMulticuota, setTipoMulticuota] = useState('Oferta');
  const [cuotaDesde, setCuotaDesde] = useState('');
  const [cuotaHasta, setCuotaHasta] = useState('');
  const [fechaMulticuota, setFechaMulticuota] = useState('');
  const [nuevaGestion, setNuevaGestion] = useState('');

  const [reportSearch, setReportSearch] = useState('');
  const [reportFilterEstado, setReportFilterEstado] = useState('Todos');
  const [reportFilterEjecutivo, setReportFilterEjecutivo] = useState('Todos');
  const [reportFilterVencidas, setReportFilterVencidas] = useState('');

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalMessage, setConfirmModalMessage] = useState('');
  const [onConfirmAction, setOnConfirmAction] = useState<(() => void) | null>(null);

  const activeClient = clients.find((c) => c.id === activeClientId) || clients[0];

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 6000);
  };

  useEffect(() => {
    if (!auth) return;

    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error: any) {
        console.error('Error de autenticación:', error);
        if (error.code === 'auth/operation-not-allowed') {
          showToast("ERROR EN FIREBASE: Ve a Authentication > Sign-in method y habilita el acceso Anónimo.", "error");
        } else {
          showToast(`ERROR DE CONEXIÓN: ${error.message}`, "error");
        }
      }
    };
    
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    
    // Ruta principal exclusiva para tu sistema
    const docRef = doc(db, 'sistema_aportes', 'base_principal');
    
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      setIsOnline(true);
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.clients) setClients(data.clients);
        if (data.customCuotas) setCustomCuotas(data.customCuotas);
        if (data.gestiones) setGestiones(data.gestiones);
        if (data.descMora) setDescMora(data.descMora);
        if (data.descCobranza) setDescCobranza(data.descCobranza);
        if (data.moraParams) setMoraParams(data.moraParams);
        if (data.cobranzaParams) setCobranzaParams(data.cobranzaParams);
        if (data.fechaCalculoMora) setFechaCalculoMora(data.fechaCalculoMora);
      }
    }, (error: any) => {
      setIsOnline(false);
      console.error("Error de Firestore:", error);
      if (error.code === 'permission-denied') {
        showToast("ERROR EN FIREBASE: Ve a Firestore Database > Reglas y asegúrate de poner 'allow read, write: if true;'", "error");
      }
    });

    return () => unsubscribe();
  }, [user]);

  const syncToFirebase = (overrides: any = {}) => {
    if (!user || !db) {
      showToast("Esperando conexión a la nube...", "info");
      return;
    }
    
    const sanitize = (obj: any) => JSON.parse(JSON.stringify(obj));
    const payload = sanitize({
      clients, customCuotas, gestiones, descMora, descCobranza,
      moraParams, cobranzaParams, fechaCalculoMora,
      ...overrides
    });

    const docRef = doc(db, 'sistema_aportes', 'base_principal');
    setDoc(docRef, payload).catch(e => {
      console.error("Error guardando:", e);
      showToast("No se pudo guardar en la nube. Revisa las reglas de Firestore.", "error");
    });
  };

  const switchTab = (tabName: string) => setActiveTab(tabName);
  const openMoraTab = (clientId?: string) => {
    if (clientId) setActiveClientId(clientId);
    setActiveTab('mora-cobranzas');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => evt.target?.result && setLogoUrl(evt.target.result as string);
      reader.readAsDataURL(file);
    }
  };

  const createNewClient = () => {
    setFormData({
      id: Date.now().toString(), nombres: '', docIdentidad: '', ejecutivoCartera: '', tipoPlan: 'Compra Planificada',
      estadoActivo: 'ACTIVO', grupoCodigo: '', estadoPlan: 'No Adjudicado', montoContratado: 0, valorInscripcion: 0,
      plazoPlan: 12, valorCuota: 0, cuotasPagadas: 0, valorTotalPagado: 0, fechaPrimerPago: new Date().toISOString().split('T')[0],
    });
    switchTab('client-info');
  };

  const editClient = (client: Client) => {
    setFormData({ ...client });
    setActiveClientId(client.id);
    switchTab('client-info');
  };

  const clearForm = () => {
    setFormData({ id: '', nombres: '', docIdentidad: '', ejecutivoCartera: '', tipoPlan: 'Compra Planificada', estadoActivo: 'ACTIVO', grupoCodigo: '', estadoPlan: 'No Adjudicado', montoContratado: 0, valorInscripcion: 0, plazoPlan: 12, valorCuota: 0, cuotasPagadas: 0, valorTotalPagado: 0, fechaPrimerPago: '' });
  };

  const calculateValues = () => {
    const cuotas = Number(formData.cuotasPagadas || 0);
    const cuotaVal = Number(formData.valorCuota || 0);
    setFormData((prev) => ({ ...prev, valorTotalPagado: cuotas * cuotaVal }));
  };

  const saveData = (goToTable: boolean = false) => {
    if (!formData.nombres || !formData.docIdentidad) {
      showToast('Por favor complete los campos obligatorios.', 'error');
      return;
    }
    const newClientObj: Client = {
      id: formData.id || Date.now().toString(),
      nombres: formData.nombres || '',
      docIdentidad: formData.docIdentidad || '',
      ejecutivoCartera: formData.ejecutivoCartera || 'Sin Asignar',
      tipoPlan: formData.tipoPlan || 'Compra Planificada',
      estadoActivo: formData.estadoActivo || 'ACTIVO',
      grupoCodigo: formData.grupoCodigo || 'N/A',
      estadoPlan: formData.estadoPlan || 'No Adjudicado',
      formaAdjudicacion: formData.formaAdjudicacion || '',
      fechaAdjudicacion: formData.fechaAdjudicacion || '',
      numeroAsamblea: formData.numeroAsamblea || '',
      montoContratado: Number(formData.montoContratado || 0),
      valorInscripcion: Number(formData.valorInscripcion || 0),
      plazoPlan: Number(formData.plazoPlan || 12),
      valorCuota: Number(formData.valorCuota || 0),
      cuotasPagadas: Number(formData.cuotasPagadas || 0),
      valorTotalPagado: Number(formData.cuotasPagadas || 0) * Number(formData.valorCuota || 0),
      fechaPrimerPago: formData.fechaPrimerPago || new Date().toISOString().split('T')[0],
      valorEntrada: Number(formData.valorEntrada || 0),
    };

    setClients((prev) => {
      const idx = prev.findIndex((c) => c.id === newClientObj.id);
      let newClients;
      if (idx >= 0) { const copy = [...prev]; copy[idx] = newClientObj; newClients = copy; }
      else { newClients = [...prev, newClientObj]; }
      syncToFirebase({ clients: newClients }); 
      return newClients;
    });

    setActiveClientId(newClientObj.id);
    showToast('Cliente guardado exitosamente en la nube.', 'success');
    if (goToTable) switchTab('payment-table');
    else switchTab('dashboard');
  };

  const deleteClient = (id: string) => {
    setConfirmModalMessage('¿Está seguro de que desea eliminar este cliente de la Nube?');
    setOnConfirmAction(() => () => {
      setClients((prev) => {
        const newClients = prev.filter((c) => c.id !== id);
        syncToFirebase({ clients: newClients });
        return newClients;
      });
      setShowConfirmModal(false);
      showToast('Cliente eliminado correctamente.', 'success');
    });
    setShowConfirmModal(true);
  };

  const clearDatabase = () => {
    setConfirmModalMessage('¿Desea BORRAR TODA la base de datos de la Nube permanentemente?');
    setOnConfirmAction(() => () => {
      setClients([]); setCustomCuotas({}); setGestiones({}); setDescMora({}); setDescCobranza({});
      syncToFirebase({ clients: [], customCuotas: {}, gestiones: {}, descMora: {}, descCobranza: {} });
      setPreviewData([]);
      setShowConfirmModal(false);
      showToast('Base de datos reiniciada.', 'success');
    });
    setShowConfirmModal(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!(window as any).XLSX) {
      showToast("Iniciando motor de Excel...", "info");
      try {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
          script.onload = () => resolve();
          script.onerror = () => reject();
          document.head.appendChild(script);
        });
      } catch (error) {
        showToast("No se pudo cargar el lector de Excel. Verifica tu conexión.", "error");
        return;
      }
    }

    const XLSX = (window as any).XLSX;
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        if (rows.length < 2) throw new Error("Vacío");
        
        const headers = rows[0].map((h) => String(h || '').trim().toLowerCase());
        
        const parsedData = rows.slice(1).map((row, index) => {
          const getCol = (names: string[]) => {
            const idx = headers.findIndex((h) => names.some((n) => h.includes(n)));
            return idx >= 0 && row[idx] !== undefined ? String(row[idx]).trim() : '';
          };
          if (!row || row.length === 0 || !getCol(['cliente', 'nombre'])) return null;

          const cuotasPagadas = parseInt(getCol(['cobradas', 'pagadas'])) || 0;
          let rawVencidas = getCol(['vencida', 'mora']);
          if (!rawVencidas && row.length > 8) rawVencidas = String(row[8] || '').trim();
          const vencidasExcel = parseInt(rawVencidas, 10) || 0;

          let fechaPrimerPago = new Date().toISOString().split('T')[0];
          const expectedCuotas = cuotasPagadas + vencidasExcel;
          if (expectedCuotas > 0) {
              const pastDate = new Date();
              pastDate.setMonth(pastDate.getMonth() - (expectedCuotas - 1));
              pastDate.setDate(28);
              fechaPrimerPago = pastDate.toISOString().split('T')[0];
          }

          return {
            id: `temp_${index}`,
            nombres: getCol(['cliente', 'nombre']) || 'CLIENTE IMPORTADO',
            docIdentidad: getCol(['identificaci', 'doc', 'cedula', 'idcodigo']) || `9999999${index}`,
            ejecutivoCartera: getCol(['ejecutivo', 'asesor']) || 'Sin Asignar',
            grupoCodigo: getCol(['grupo', 'plan']) || 'ACV000',
            montoContratado: parseFloat(getCol(['monto', 'contratado'])) || 10000,
            valorCuota: parseFloat(getCol(['cuota', 'mensual'])) || 200,
            plazoPlan: 72,
            estadoPlan: getCol(['estado']) || 'No Adjudicado',
            cuotasPagadas: cuotasPagadas,
            valorInscripcion: 0,
            estadoActivo: 'ACTIVO',
            tipoPlan: 'Compra Planificada',
            fechaPrimerPago: fechaPrimerPago,
            valorTotalPagado: 0,
            vencidasExcel: vencidasExcel,
            valorEntrada: 0
          };
        }).filter((item) => item !== null);
        
        setPreviewData(parsedData);
        showToast(`Excel listo: ${parsedData.length} registros detectados.`, "success");
      } catch (err) {
        showToast("Error. Asegúrese de que sea un Excel válido (.xlsx).", "error");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const importDataFromPreview = () => {
    if (previewData.length === 0) return;
    const validatedData = previewData.map((d) => ({
      ...d,
      valorTotalPagado: d.cuotasPagadas * d.valorCuota,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9)
    }));
    setClients((prev) => {
      const newClients = [...prev, ...validatedData];
      syncToFirebase({ clients: newClients });
      return newClients;
    });
    setPreviewData([]);
    showToast(`${validatedData.length} clientes subidos a la Nube.`, "success");
    switchTab('dashboard');
  };

  const addMoraParam = () => setMoraParams((prev) => {
    const copy = [...prev, { diasMin: 0, diasMax: 0, tasaAnual: 0 }];
    syncToFirebase({ moraParams: copy });
    return copy;
  });
  const removeMoraParam = (index: number) => setMoraParams((prev) => {
    const copy = prev.filter((_, i) => i !== index);
    syncToFirebase({ moraParams: copy });
    return copy;
  });
  const updateMoraParam = (index: number, field: keyof MoraParam, value: number) => {
    setMoraParams((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      syncToFirebase({ moraParams: copy });
      return copy;
    });
  };

  const addCobranzaParam = () => setCobranzaParams((prev) => {
    const copy = [...prev, { saldoMin: 0, saldoMax: 0, valor: 0 }];
    syncToFirebase({ cobranzaParams: copy });
    return copy;
  });
  const removeCobranzaParam = (index: number) => setCobranzaParams((prev) => {
    const copy = prev.filter((_, i) => i !== index);
    syncToFirebase({ cobranzaParams: copy });
    return copy;
  });
  const updateCobranzaParam = (index: number, field: keyof CobranzaParam, value: number) => {
    setCobranzaParams((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      syncToFirebase({ cobranzaParams: copy });
      return copy;
    });
  };

  const handleCuotaEdit = (clientId: string, quotaNum: number, field: keyof CustomCuota, value: string | number, defaultVencimiento: string, defaultFechaPago: string) => {
    setCustomCuotas((prev) => {
      const clientData = prev[clientId] || {};
      const existingCuota = clientData[quotaNum] || {
        num: quotaNum, cuotaVal: activeClient?.valorCuota || 0,
        abonoVal: quotaNum <= (activeClient?.cuotasPagadas || 0) ? (activeClient?.valorCuota || 0) : 0,
        vencimiento: defaultVencimiento, fechaPago: defaultFechaPago,
      };

      const updatedClientData = { ...clientData };
      updatedClientData[quotaNum] = { ...existingCuota, [field]: value };

      // CASCADA DE FECHAS: Siempre al día 5
      if (field === 'vencimiento' && typeof value === 'string') {
        let [y, m] = value.split('-').map(Number);
        for (let k = quotaNum + 1; k <= (activeClient?.plazoPlan || 0); k++) {
          m++; if (m > 12) { m = 1; y++; }
          const nextDateStr = `${y}-${String(m).padStart(2, '0')}-05`;
          
          const existingK = updatedClientData[k] || {
            num: k, cuotaVal: activeClient?.valorCuota || 0,
            abonoVal: k <= (activeClient?.cuotasPagadas || 0) ? (activeClient?.valorCuota || 0) : 0,
            vencimiento: nextDateStr, fechaPago: ''
          };
          updatedClientData[k] = { ...existingK, vencimiento: nextDateStr };
        }
      }

      const newState = { ...prev, [clientId]: updatedClientData };
      syncToFirebase({ customCuotas: newState });
      return newState;
    });
  };

  const aplicarPagoMulticuotas = () => {
    const desde = parseInt(cuotaDesde, 10);
    const hasta = parseInt(cuotaHasta, 10);
    if (isNaN(desde) || isNaN(hasta) || desde > hasta || desde < 1 || !activeClient) return;

    setCustomCuotas((prev) => {
      const clientMap = { ...(prev[activeClient.id] || {}) };
      for (let i = desde; i <= hasta; i++) {
        clientMap[i] = {
          num: i, cuotaVal: activeClient.valorCuota, abonoVal: activeClient.valorCuota,
          vencimiento: clientMap[i]?.vencimiento || new Date().toISOString().split('T')[0],
          fechaPago: fechaMulticuota || new Date().toISOString().split('T')[0],
          estadoOverride: `CANCELADA (${tipoMulticuota.toUpperCase()})`,
        };
      }
      const newState = { ...prev, [activeClient.id]: clientMap };
      syncToFirebase({ customCuotas: newState });
      return newState;
    });
    showToast(`Pago Multicuotas aplicado (Cuotas ${desde} a ${hasta}).`, 'success');
  };

  const guardarTabla = () => {
    syncToFirebase();
    showToast('Tabla sincronizada con la Nube.', 'success');
  };

  const guardarGestion = () => {
    if (!nuevaGestion.trim() || !activeClient) return;
    const item = { fecha: new Date().toLocaleString(), texto: nuevaGestion.trim() };
    setGestiones((prev) => {
      const newState = { ...prev, [activeClient.id]: [item, ...(prev[activeClient.id] || [])] };
      syncToFirebase({ gestiones: newState });
      return newState;
    });
    setNuevaGestion('');
  };

  const calculateVencidas = (c: Client) => {
    if (!c.fechaPrimerPago) return 0;
    const f1 = new Date(c.fechaPrimerPago);
    const f2 = new Date(fechaCalculoMora);
    if (isNaN(f1.getTime()) || isNaN(f2.getTime())) return 0;
    let monthsDiff = (f2.getFullYear() - f1.getFullYear()) * 12 + (f2.getMonth() - f1.getMonth());
    let expectedCuotas = monthsDiff + 1; 
    if (expectedCuotas > c.plazoPlan) expectedCuotas = c.plazoPlan;
    if (expectedCuotas < 0) expectedCuotas = 0;
    const venc = expectedCuotas - c.cuotasPagadas;
    return venc > 0 ? venc : 0;
  };

  const filteredClients = clients.filter((c) =>
      c.nombres.toLowerCase().includes(searchQuery.toLowerCase()) || c.docIdentidad.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredReportClients = clients.filter((c) => {
    const matchesSearch = c.nombres.toLowerCase().includes(reportSearch.toLowerCase()) || c.docIdentidad.toLowerCase().includes(reportSearch.toLowerCase());
    const matchesEstado = reportFilterEstado === 'Todos' || c.estadoPlan === reportFilterEstado;
    const matchesEjecutivo = reportFilterEjecutivo === 'Todos' || c.ejecutivoCartera === reportFilterEjecutivo;
    let matchesVencidas = true;
    if (reportFilterVencidas !== '') {
      const targetVencidas = parseInt(reportFilterVencidas, 10);
      if (!isNaN(targetVencidas)) matchesVencidas = calculateVencidas(c) === targetVencidas;
    }
    return matchesSearch && matchesEstado && matchesEjecutivo && matchesVencidas;
  });

  const exportToExcel = (type: string) => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    if (type === 'general') {
      csvContent += 'CLIENTE,IDENTIFICACIÓN,GRUPO/PLAN,MONTO,ESTADO,CUOTA MES,VENCIDAS,VALOR VENCIDO,PAGADAS (TOTAL),COBRADAS (MES),RECAUDO (MES),PENDIENTES,VALOR PENDIENTE,EJECUTIVO\n';
      filteredReportClients.forEach((c) => {
        const vencidas = calculateVencidas(c);
        const valVencido = vencidas * c.valorCuota;
        let cobradasMes = 0;
        const calcDate = new Date(fechaCalculoMora);
        if (customCuotas[c.id]) {
          Object.values(customCuotas[c.id]).forEach((cuota) => {
            if (cuota.fechaPago && cuota.abonoVal > 0) {
              const d = new Date(cuota.fechaPago);
              if (d.getMonth() === calcDate.getMonth() && d.getFullYear() === calcDate.getFullYear()) cobradasMes++;
            }
          });
        }
        const recaudoMes = cobradasMes * c.valorCuota;
        const pendientes = c.plazoPlan - c.cuotasPagadas;
        csvContent += `"${c.nombres}","${c.docIdentidad}","${c.grupoCodigo}",${c.montoContratado},"${c.estadoPlan}",${c.valorCuota},${vencidas},${valVencido},${c.cuotasPagadas},${cobradasMes},${recaudoMes},${pendientes},${pendientes * c.valorCuota},"${c.ejecutivoCartera}"\n`;
      });
    } else if (type === 'ejecutivos') {
      csvContent += 'EJECUTIVO DE CARTERA,TOTAL CLIENTES,RECAUDO (MES)\n';
      Array.from(new Set(clients.map((c) => c.ejecutivoCartera))).forEach((ej) => {
        const ejClients = clients.filter((c) => c.ejecutivoCartera === ej);
        const totalRecaudo = ejClients.reduce((acc, curr) => acc + (curr.cuotasPagadas * curr.valorCuota), 0);
        csvContent += `"${ej}",${ejClients.length},${totalRecaudo}\n`;
      });
    }
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `reporte_${type}_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  let pendingQuotas: any[] = [];
  let subtotalVencidas = 0; let subtotalMora = 0; let subtotalCobranzas = 0; let tasaAdministrativa = 0;

  if (activeClient) {
    if (activeClient.plazoPlan > 0 && activeClient.montoContratado > 0) {
      const monto = activeClient.montoContratado;
      const totalCuotasVal = activeClient.valorCuota * activeClient.plazoPlan;
      let diferencia = activeClient.tipoPlan === 'Adjudicación Planificada' ? totalCuotasVal - (monto - (activeClient.valorEntrada || 0)) : totalCuotasVal - monto;
      const anios = activeClient.plazoPlan / 12;
      if (activeClient.estadoPlan === 'Adjudicado' && anios > 0 && monto > 0) {
        tasaAdministrativa = ((diferencia / monto) / anios) * 100;
      }
    }

    const fechaCalc = new Date(`${fechaCalculoMora}T00:00:00`);
    let baseVencimiento = new Date(activeClient.fechaPrimerPago || '2021-08-28');
    let [y, m, d] = (activeClient.fechaPrimerPago || '2021-08-28').split('-');
    baseVencimiento = new Date(Number(y), Number(m) - 1, Number(d));

    for (let i = 1; i <= activeClient.plazoPlan; i++) {
      const yy = baseVencimiento.getFullYear();
      const mm = String(baseVencimiento.getMonth() + 1).padStart(2, '0');
      const dd = String(baseVencimiento.getDate()).padStart(2, '0');
      let defaultVencimiento = `${yy}-${mm}-${dd}`;

      const custom = customCuotas[activeClient.id]?.[i];
      const isPaidDefault = i <= activeClient.cuotasPagadas;
      const cuotaVal = custom?.cuotaVal ?? activeClient.valorCuota;
      const abonoVal = custom?.abonoVal ?? (isPaidDefault ? activeClient.valorCuota : 0);
      const currentVencimientoStr = custom?.vencimiento || defaultVencimiento;
      
      // Update cascada base for next row
      const [cy, cm, cd] = currentVencimientoStr.split('-');
      baseVencimiento = new Date(Number(cy), Number(cm) - 1, Number(cd));
      baseVencimiento.setMonth(baseVencimiento.getMonth() + 1);
      baseVencimiento.setDate(5);

      if (abonoVal < cuotaVal) {
        const currentVencimiento = new Date(`${currentVencimientoStr}T00:00:00`);
        const timeDiff = fechaCalc.getTime() - currentVencimiento.getTime();
        const daysLate = Math.ceil(timeDiff / (1000 * 3600 * 24));

        if (daysLate > 0) {
          const saldo = Math.max(0, cuotaVal - abonoVal);
          let moraBase = 0; let cobranzaBase = 0;

          if (daysLate >= 1) {
            const param = moraParams.find((p) => daysLate >= p.diasMin && daysLate <= p.diasMax) || moraParams[moraParams.length - 1];
            if (param) {
              const recargo = tasaAdministrativa * (param.tasaAnual / 100);
              const nuevaTasaAnual = tasaAdministrativa + recargo;
              const tasaDiaria = nuevaTasaAnual / 365;
              moraBase = saldo * (Math.pow(1 + (tasaDiaria / 100), daysLate) - 1);
            }
          }

          if (daysLate >= 16) {
            const param = cobranzaParams.find((p) => saldo >= p.saldoMin && saldo <= p.saldoMax) || cobranzaParams[cobranzaParams.length - 1];
            if (param) cobranzaBase = param.valor;
          }

          const descM = descMora[i] ?? (i === 1 ? 100 : 0);
          const descC = descCobranza[i] ?? 0;
          const moraTotal = moraBase * (1 - descM / 100);
          const cobranzaTotal = cobranzaBase * (1 - descC / 100);
          
          pendingQuotas.push({ num: i, vencimientoStr: currentVencimientoStr, daysLate, saldo, moraBase, cobranzaBase, descM, descC, totalRow: saldo + moraTotal + cobranzaTotal });
          subtotalVencidas += saldo; subtotalMora += moraTotal; subtotalCobranzas += cobranzaTotal;
        }
      }
    }
  }

  return (
    <div ref={rootRef} className="min-h-screen bg-slate-100 print:bg-white flex flex-col font-sans text-slate-800 relative">
      {toast.show && (
        <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-xl text-white text-sm font-medium z-50 transform transition-all duration-300 print:hidden ${toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'}`}>
          {toast.message}
        </div>
      )}

      {/* HEADER */}
      <header className="bg-blue-900 text-white shadow-md print:hidden z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between h-16 items-center">
          <div className="flex items-center">
            <svg className="h-7 w-7 mr-3 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <h1 className="text-xl font-bold">Sistema de Aportes</h1>
            {isOnline ? (
              <span className="ml-4 px-3 py-1 bg-emerald-500 text-emerald-950 rounded-full text-xs font-black shadow-sm flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-100 animate-pulse"></span>
                NUBE COMPARTIDA (EN LÍNEA)
              </span>
            ) : (
              <span className="ml-4 px-3 py-1 bg-red-500 text-white rounded-full text-xs font-black shadow-sm flex items-center gap-1.5 cursor-help" title="Asegúrate de que Vercel haya compilado tu código con las claves y de que las Reglas de Firebase estén correctas.">
                <span className="w-2 h-2 rounded-full bg-red-200"></span>
                MODO OFFLINE (Desconectado)
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 print:p-0 print:m-0 print:max-w-none">
        <div className="mb-6 border-b border-slate-300 print:hidden">
          <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
            {[
              { id: 'base', name: '0. BASE (Importar)' },
              { id: 'dashboard', name: '1. Bandeja de Gestión' },
              { id: 'client-info', name: '2. Información del Cliente' },
              { id: 'payment-table', name: '3. Estado de Cuenta y Pagos' },
              ...(activeTab === 'mora-cobranzas' ? [{ id: 'mora-cobranzas', name: '4. Mora y Cobranzas' }] : []),
              { id: 'reportes', name: '5. Reportes y Productividad' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => tab.id === 'mora-cobranzas' ? openMoraTab() : switchTab(tab.id)}
                className={`whitespace-nowrap py-3 px-1 border-b-2 font-semibold text-sm transition-colors ${
                  activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {}
        {activeTab === 'base' && (
          <div className="bg-white shadow-lg rounded-xl border border-slate-200 p-6 print:hidden">
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Carga de Base de Datos Compartida</h2>
                <p className="text-sm text-slate-500 mt-1">Sincronización multidisciplinaria en la nube.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
                <input
                  type="file" accept=".xlsx, .xls"
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  onChange={handleFileUpload}
                />
                <button type="button" onClick={clearDatabase} className="px-4 py-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 font-bold text-sm w-full sm:w-auto border border-red-200 whitespace-nowrap">
                  Borrar Base Actual
                </button>
              </div>
            </div>
            {previewData.length > 0 ? (
              <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <div className="bg-white p-4 border-b border-slate-200 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 text-lg">Vista Previa de Datos <span className="text-slate-500 font-normal text-sm ml-2">({previewData.length} registros)</span></h3>
                  <button onClick={importDataFromPreview} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md shadow-sm text-sm flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    Importar a la Nube
                  </button>
                </div>
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="min-w-full divide-y divide-slate-200 text-sm whitespace-nowrap">
                    <thead className="bg-slate-800 text-white sticky top-0 text-[10px] uppercase font-bold tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-left">Grupo</th><th className="px-4 py-3 text-left">Puesto</th><th className="px-4 py-3 text-left">Ciudad</th>
                        <th className="px-4 py-3 text-left">IDCodigo</th><th className="px-4 py-3 text-left">Cliente</th><th className="px-4 py-3 text-left">Tel. Celular</th>
                        <th className="px-4 py-3 text-left">Monto</th><th className="px-4 py-3 text-left">Cuota</th><th className="px-4 py-3 text-left">Vencidas</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {previewData.slice(0, 50).map((c, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-600">{c.grupoCodigo}</td><td className="px-4 py-3 text-slate-500">{c.puesto}</td><td className="px-4 py-3 text-slate-500">{c.ciudad}</td>
                          <td className="px-4 py-3 text-slate-500">{c.docIdentidad}</td><td className="px-4 py-3 font-semibold text-slate-800">{c.nombres}</td><td className="px-4 py-3 text-slate-500">{c.celular}</td>
                          <td className="px-4 py-3 text-slate-600">${c.montoContratado}</td><td className="px-4 py-3 text-slate-600">${c.valorCuota}</td><td className="px-4 py-3 text-slate-500">{c.vencidasExcel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 px-4 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50">
                <h3 className="mt-2 text-sm font-medium text-slate-900">Ningún archivo cargado</h3>
                <p className="mt-1 text-xs text-slate-500">Sube un archivo de Excel para sincronizar e importar a Firestore.</p>
              </div>
            )}
          </div>
        )}

        {}
        {activeTab === 'dashboard' && (
          <div className="bg-white shadow-lg rounded-xl border border-slate-100 p-6 print:hidden">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">Bandeja de Gestión de Clientes</h2>
              <button onClick={createNewClient} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm text-sm font-bold">+ Nuevo Cliente</button>
            </div>
            <div className="mb-4">
              <input type="text" value={searchQuery} onChange={(e) => setSearchInput(e.target.value)} placeholder="Buscar por nombre o documento..." className="w-full md:w-1/3 rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" />
            </div>
            <div className="table-container overflow-x-auto border border-slate-200 rounded-lg">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-xs uppercase">Cliente</th>
                    <th className="px-4 py-3 text-left font-bold text-xs uppercase">Documento</th>
                    <th className="px-4 py-3 text-left font-bold text-xs uppercase">Plan / Grupo</th>
                    <th className="px-4 py-3 text-left font-bold text-xs uppercase">Monto</th>
                    <th className="px-4 py-3 text-left font-bold text-xs uppercase">Ejecutivo</th>
                    <th className="px-4 py-3 text-center font-bold text-xs uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredClients.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 border-b border-slate-100">
                      <td className="px-4 py-4 font-bold text-slate-800 text-sm">{c.nombres}</td>
                      <td className="px-4 py-4 text-slate-500 text-sm">{c.docIdentidad}</td>
                      <td className="px-4 py-4 text-sm"><div className="text-slate-600 font-medium">{c.tipoPlan}</div><div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">GRUPO: {c.grupoCodigo}</div></td>
                      <td className="px-4 py-4 font-bold text-slate-800 text-sm">${c.montoContratado.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-4 text-slate-600 text-sm">{c.ejecutivoCartera}</td>
                      <td className="px-4 py-4 text-center">
                        <div className="inline-flex items-center space-x-2">
                          <button onClick={() => { setActiveClientId(c.id); switchTab('payment-table'); }} className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-md font-bold text-xs hover:bg-emerald-200">Tabla</button>
                          <button onClick={() => editClient(c)} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-md font-bold text-xs hover:bg-blue-200">Editar</button>
                          <button onClick={() => deleteClient(c.id)} className="px-3 py-1 bg-red-100 text-red-800 rounded-md font-bold text-xs hover:bg-red-200">Borrar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredClients.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No hay clientes registrados en la Base de Datos compartida.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {}
        {activeTab === 'client-info' && (
          <div className="bg-white shadow-lg rounded-xl border border-slate-100 p-6 print:hidden">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">Datos del Plan y Cliente</h2>
              <div className="space-x-2 flex items-center">
                <button type="button" onClick={clearForm} className="px-3 py-2 bg-slate-100 text-slate-600 border border-slate-300 rounded-md hover:bg-slate-200 text-sm font-bold">Limpiar</button>
                <button type="button" onClick={() => saveData(false)} className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm font-bold">Guardar</button>
                <button type="button" onClick={() => saveData(true)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-bold">Guardar y Ver Tabla</button>
              </div>
            </div>
            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
              <div className="bg-slate-50 p-5 rounded-lg border border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Identificación</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Nombres</label><input type="text" value={formData.nombres || ''} onChange={(e) => setFormData({ ...formData, nombres: e.target.value })} className="w-full rounded border-slate-300 p-2 border" required /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Doc. Identidad</label><input type="text" value={formData.docIdentidad || ''} onChange={(e) => setFormData({ ...formData, docIdentidad: e.target.value })} className="w-full rounded border-slate-300 p-2 border" required /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Ejecutivo</label><input type="text" value={formData.ejecutivoCartera || ''} onChange={(e) => setFormData({ ...formData, ejecutivoCartera: e.target.value })} className="w-full rounded border-slate-300 p-2 border" /></div>
                </div>
              </div>
              <div className="bg-slate-50 p-5 rounded-lg border border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Detalles del Plan</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Tipo</label><select value={formData.tipoPlan || 'Compra Planificada'} onChange={(e) => setFormData({ ...formData, tipoPlan: e.target.value })} className="w-full rounded border-slate-300 p-2 border bg-white"><option value="Compra Planificada">Compra Planificada</option><option value="Adjudicación Planificada">Adjudicación Planificada</option></select></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Grupo/Código</label><input type="text" value={formData.grupoCodigo || ''} onChange={(e) => setFormData({ ...formData, grupoCodigo: e.target.value })} className="w-full rounded border-slate-300 p-2 border" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Estado General</label><select value={formData.estadoPlan || 'No Adjudicado'} onChange={(e) => setFormData({ ...formData, estadoPlan: e.target.value })} className="w-full rounded border-slate-300 p-2 border bg-white"><option value="No Adjudicado">No Adjudicado</option><option value="Adjudicado">Adjudicado</option></select></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">F. Adjudicación</label><input type="date" value={formData.fechaAdjudicacion || ''} onChange={(e) => setFormData({ ...formData, fechaAdjudicacion: e.target.value })} className="w-full rounded border-slate-300 p-2 border bg-white" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Forma Adjudicación</label><input type="text" placeholder="Ej: Oferta, Sorteo..." value={formData.formaAdjudicacion || ''} onChange={(e) => setFormData({ ...formData, formaAdjudicacion: e.target.value })} className="w-full rounded border-slate-300 p-2 border" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1"># Asamblea</label><input type="text" value={formData.numeroAsamblea || ''} onChange={(e) => setFormData({ ...formData, numeroAsamblea: e.target.value })} className="w-full rounded border-slate-300 p-2 border" /></div>
                </div>
              </div>
              <div className="bg-slate-50 p-5 rounded-lg border border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Valores</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Monto</label><input type="number" value={formData.montoContratado || ''} onChange={(e) => { setFormData({ ...formData, montoContratado: Number(e.target.value) }); calculateValues(); }} className="w-full rounded border-slate-300 p-2 border" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Plazo (Meses)</label><input type="number" value={formData.plazoPlan || ''} onChange={(e) => setFormData({ ...formData, plazoPlan: Number(e.target.value) })} className="w-full rounded border-slate-300 p-2 border" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Cuota</label><input type="number" value={formData.valorCuota || ''} onChange={(e) => { setFormData({ ...formData, valorCuota: Number(e.target.value) }); calculateValues(); }} className="w-full rounded border-slate-300 p-2 border" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Pagadas</label><input type="number" value={formData.cuotasPagadas || ''} onChange={(e) => { setFormData({ ...formData, cuotasPagadas: Number(e.target.value) }); calculateValues(); }} className="w-full rounded border-slate-300 p-2 border" /></div>
                </div>
              </div>
            </form>
          </div>
        )}

        {}
        {activeTab === 'payment-table' && activeClient && (() => {
          let runningSaldoPlan = activeClient.valorCuota * activeClient.plazoPlan;
          let canceladasCount = 0;
          let totalCancelado = 0;

          const formatD = (dStr: string) => {
            if(!dStr) return '';
            const [y,m,d] = dStr.split('-');
            return `${d}/${m}/${y}`;
          };

          let baseVencimiento = new Date(activeClient.fechaPrimerPago || '2021-08-28');
          let [y, m, d] = (activeClient.fechaPrimerPago || '2021-08-28').split('-');
          baseVencimiento = new Date(Number(y), Number(m) - 1, Number(d));

          const calculatedRows = Array.from({ length: activeClient.plazoPlan }, (_, idx) => {
            const i = idx + 1;
            
            const yy = baseVencimiento.getFullYear();
            const mm = String(baseVencimiento.getMonth() + 1).padStart(2, '0');
            const dd = String(baseVencimiento.getDate()).padStart(2, '0');
            let defaultVencimiento = `${yy}-${mm}-${dd}`;

            const custom = customCuotas[activeClient.id]?.[i];
            const isPaidDefault = i <= activeClient.cuotasPagadas;
            const cuotaVal = custom?.cuotaVal ?? activeClient.valorCuota;
            const abonoVal = custom?.abonoVal ?? (isPaidDefault ? activeClient.valorCuota : 0);
            const isPaid = abonoVal >= cuotaVal;
            
            const saldoInicial = runningSaldoPlan;
            const saldoCuota = Math.max(0, cuotaVal - abonoVal);
            runningSaldoPlan = Math.max(0, runningSaldoPlan - abonoVal);
            const saldoPlan = runningSaldoPlan;
            
            const currentVenc = custom?.vencimiento || defaultVencimiento;
            const defaultFechaPago = isPaidDefault ? currentVenc : '';
            const currentPago = custom?.fechaPago || defaultFechaPago;

            const [cy, cm, cd] = currentVenc.split('-');
            baseVencimiento = new Date(Number(cy), Number(cm) - 1, Number(cd));
            baseVencimiento.setMonth(baseVencimiento.getMonth() + 1);
            baseVencimiento.setDate(5);

            let rowStatus = "PENDIENTE";
            let rowStatusClass = "text-slate-600";
            let rowBadgeClass = "bg-transparent";
            let diasCalculados = 0;
            let onClickAction: (() => void) | undefined = undefined;

            if (isPaid) {
              rowStatus = custom?.estadoOverride || "CANCELADA";
              rowStatusClass = "text-blue-700 font-bold text-[9px]";
              rowBadgeClass = "bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200";
              canceladasCount++;
              totalCancelado += abonoVal;
            } else {
              const timeDiff = new Date(`${fechaCalculoMora}T00:00:00`).getTime() - new Date(`${currentVenc}T00:00:00`).getTime();
              const calcDias = Math.floor(timeDiff / (1000 * 3600 * 24));
              if (calcDias > 0) {
                rowStatus = "VENCIDO";
                rowStatusClass = "text-red-600 font-bold text-[9px]";
                rowBadgeClass = "bg-red-50 px-2 py-0.5 rounded-full border border-red-200 cursor-pointer hover:bg-red-100 hover:scale-105 transition-all shadow-sm";
                diasCalculados = calcDias;
                onClickAction = () => openMoraTab(activeClient.id);
              } else {
                rowStatusClass = "text-amber-600 font-bold text-[9px]";
                rowBadgeClass = "bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200";
              }
            }

            return {
              i, cuotaVal, abonoVal, saldoInicial, saldoCuota, saldoPlan, currentVenc, currentPago, isPaid, rowStatus, rowStatusClass, rowBadgeClass, diasCalculados, onClickAction
            };
          });

          return (
            <div className="w-full">
              <div className="bg-white shadow-lg rounded-xl border border-slate-100 p-6 print:hidden">
                <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-slate-200 pb-4">
                  <div className="w-full sm:w-1/2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">Agregar Logo</label>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto mt-4 sm:mt-0">
                    <button onClick={guardarTabla} className="w-full sm:w-auto flex justify-center items-center px-4 py-2 bg-blue-600 text-white rounded-md font-bold shadow-sm hover:bg-blue-700">Guardar Tabla</button>
                    <button onClick={() => window.print()} className="w-full sm:w-auto flex justify-center items-center px-4 py-2 bg-emerald-600 text-white rounded-md font-bold shadow-sm hover:bg-emerald-700">Imprimir Reporte</button>
                  </div>
                </div>

                <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <label className="inline-flex items-center cursor-pointer font-bold text-slate-800 text-sm">
                      <input type="checkbox" checked={showMulticuotas} onChange={(e) => setShowMulticuotas(e.target.checked)} className="form-checkbox h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 mr-2" />
                      <span>Activar Multicuotas</span>
                    </label>
                  </div>
                  {showMulticuotas && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end text-sm">
                        <div><label className="block text-xs font-bold text-slate-700 mb-1">Tipo</label><select value={tipoMulticuota} onChange={(e) => setTipoMulticuota(e.target.value)} className="w-full rounded border-slate-300 p-2 border bg-white"><option value="Oferta">Oferta</option><option value="Varias">Varias</option></select></div>
                        <div><label className="block text-xs font-bold text-slate-700 mb-1">Desde #</label><input type="number" min="1" value={cuotaDesde} onChange={(e) => setCuotaDesde(e.target.value)} className="w-full rounded border-slate-300 p-2 border" /></div>
                        <div><label className="block text-xs font-bold text-slate-700 mb-1">Hasta #</label><input type="number" min="1" value={cuotaHasta} onChange={(e) => setCuotaHasta(e.target.value)} className="w-full rounded border-slate-300 p-2 border" /></div>
                        <div><label className="block text-xs font-bold text-slate-700 mb-1">Fecha Pago</label><input type="date" value={fechaMulticuota} onChange={(e) => setFechaMulticuota(e.target.value)} className="w-full rounded border-slate-300 p-2 border" /></div>
                        <div><button type="button" onClick={aplicarPagoMulticuotas} className="w-full px-3 py-2 bg-blue-600 text-white font-bold text-xs rounded hover:bg-blue-700">Registrar Pago</button></div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-right mb-4">
                  <h2 className="text-2xl font-black uppercase text-slate-900 tracking-tight">ESTADO DE CUENTA</h2>
                  <h3 className="text-xs font-semibold text-slate-600">Reporte de Aportes Mensuales</h3>
                </div>

                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="flex-1 bg-white border border-slate-200 rounded-lg p-4">
                    <h3 className="text-sm font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">Datos del Cliente</h3>
                    <div className="grid grid-cols-[120px_1fr] gap-y-2 text-xs">
                      <span className="text-slate-500">Cliente:</span><span className="font-bold uppercase">{activeClient.nombres}</span>
                      <span className="text-slate-500">Identificación:</span><span>{activeClient.docIdentidad}</span>
                      <span className="text-slate-500">Grupo / Código:</span><span>{activeClient.grupoCodigo}</span>
                      <span className="text-slate-500">Ejecutivo Asignado:</span><span className="font-bold">{activeClient.ejecutivoCartera}</span>
                    </div>
                  </div>
                  <div className="flex-1 bg-white border border-slate-200 rounded-lg p-4">
                    <h3 className="text-sm font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">Información del Plan</h3>
                    <div className="grid grid-cols-[120px_1fr] gap-y-2 text-xs">
                      <span className="text-slate-500">Tipo de Plan:</span><span>{activeClient.tipoPlan}</span>
                      <span className="text-slate-500">Estado:</span><span className="font-bold text-emerald-600">{activeClient.estadoPlan} {activeClient.formaAdjudicacion ? `(${activeClient.formaAdjudicacion})` : ''}</span>
                      <span className="text-slate-500">Plazo Contrato:</span><span>{activeClient.plazoPlan} Meses</span>
                      <span className="text-slate-500">F. Adjudicación:</span><span>{activeClient.fechaAdjudicacion ? formatD(activeClient.fechaAdjudicacion) : 'N/A'}</span>
                      <span className="text-slate-500">Día de Pago:</span><span className="font-bold text-blue-700">5 de cada mes</span>
                    </div>
                  </div>
                </div>

                <div className="mb-6 grid grid-cols-4 gap-2">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-blue-800 uppercase mb-1">MONTO BASE</span>
                    <span className="font-black text-slate-800 text-lg">${activeClient.montoContratado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-blue-800 uppercase mb-1">CUOTA MENSUAL</span>
                    <span className="font-black text-slate-800 text-lg">${activeClient.valorCuota.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-blue-800 uppercase mb-1">INSCRIPCIÓN</span>
                    <span className="font-black text-slate-800 text-lg">${activeClient.valorInscripcion.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="bg-blue-600 rounded-lg p-3 text-center flex flex-col justify-center text-white shadow-md">
                    <span className="text-[10px] font-bold uppercase mb-1">TOTAL PLAN</span>
                    <span className="font-black text-xl">${(activeClient.valorCuota * activeClient.plazoPlan).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-[10px] text-center border-collapse rounded-lg overflow-hidden">
                    <thead className="bg-[#1e293b] text-white font-bold uppercase">
                      <tr>
                        <th className="py-3 px-2">#</th>
                        <th className="py-3 px-2 text-right">SALDO INICIAL</th>
                        <th className="py-3 px-2 text-center">CUOTA MENSUAL</th>
                        <th className="py-3 px-2 text-center">ABONO MENSUAL</th>
                        <th className="py-3 px-2 text-right">SALDO CUOTA</th>
                        <th className="py-3 px-2 text-right">SALDO PLAN</th>
                        <th className="py-3 px-2">VENCIMIENTO</th>
                        <th className="py-3 px-2">F. PAGO</th>
                        <th className="py-3 px-2">DÍAS</th>
                        <th className="py-3 px-2">ESTADO</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {calculatedRows.map(row => (
                        <tr key={row.i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-2 font-bold text-slate-800">{row.i}</td>
                          <td className="py-2 px-2 text-right text-slate-500">${row.saldoInicial.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                          <td className="py-2 px-2 text-center">
                            <div className="inline-block border border-slate-200 rounded px-2 py-1 bg-white hover:border-blue-400 focus-within:border-blue-500 transition-colors">
                              <input type="number" step="0.01" value={row.cuotaVal} onChange={(e) => handleCuotaEdit(activeClient.id, row.i, 'cuotaVal', Number(e.target.value), row.currentVenc, row.currentPago)} className="w-16 text-center bg-transparent outline-none text-slate-600 font-medium" />
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <div className="inline-block border border-slate-200 rounded px-2 py-1 bg-white hover:border-blue-400 focus-within:border-blue-500 transition-colors">
                              <input type="number" step="0.01" value={row.abonoVal} onChange={(e) => handleCuotaEdit(activeClient.id, row.i, 'abonoVal', Number(e.target.value), row.currentVenc, row.currentPago)} className="w-16 text-center bg-transparent outline-none font-bold text-slate-700" />
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right text-slate-400">${row.saldoCuota.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                          <td className="py-2 px-2 text-right font-bold text-blue-900">${row.saldoPlan.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                          <td className="py-2 px-2 text-center">
                            <div className="inline-block border border-slate-200 rounded px-2 py-1 bg-white hover:border-blue-400 focus-within:border-blue-500 transition-colors">
                              <input type="date" value={row.currentVenc} onChange={(e) => handleCuotaEdit(activeClient.id, row.i, 'vencimiento', e.target.value, row.currentVenc, row.currentPago)} className="w-24 text-center bg-transparent outline-none text-[9px] text-slate-600 cursor-pointer" />
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <div className="inline-block border border-slate-200 rounded px-2 py-1 bg-white hover:border-blue-400 focus-within:border-blue-500 transition-colors">
                              <input type="date" value={row.currentPago} onChange={(e) => handleCuotaEdit(activeClient.id, row.i, 'fechaPago', e.target.value, row.currentVenc, row.currentPago)} className="w-24 text-center bg-transparent outline-none text-[9px] text-slate-600 cursor-pointer" />
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center text-slate-500">{row.diasCalculados > 0 ? row.diasCalculados : '0'}</td>
                          <td className="py-2 px-2 text-center">
                            <span 
                              className={`inline-block w-full py-0.5 ${row.rowBadgeClass} ${row.rowStatusClass}`}
                              onClick={row.onClickAction}
                              title={row.onClickAction ? "Haga clic para Calcular Mora y Cobranzas" : undefined}
                            >
                              {row.rowStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 flex justify-end">
                  <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 w-full md:w-80">
                    <h3 className="text-sm font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100 uppercase">Resumen Final</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500 font-medium">Cuotas Canceladas:</span><span className="font-bold text-slate-800">{canceladasCount}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500 font-medium">Total Cancelado:</span><span className="font-bold text-emerald-600">${totalCancelado.toLocaleString('en-US', {minimumFractionDigits:2})}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500 font-medium">Cuotas Pendientes:</span><span className="font-bold text-slate-800">{activeClient.plazoPlan - canceladasCount}</span></div>
                      <div className="flex justify-between pt-2 border-t border-slate-100"><span className="font-bold text-slate-700 uppercase">Total Pendiente:</span><span className="font-black text-blue-700 text-lg">${runningSaldoPlan.toLocaleString('en-US', {minimumFractionDigits:2})}</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* VISTA IMPRESIÓN */}
              <div className="hidden print:block w-full bg-white text-slate-900 font-sans p-0 m-0 [-webkit-print-color-adjust:exact] [color-adjust:exact]">
                <div className="flex justify-between items-end mb-2">
                  <div className="w-48 h-16 flex items-end justify-start">
                    {logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-full object-contain" /> : <div className="w-full h-full"></div>}
                  </div>
                  <div className="text-right">
                    <h1 className="text-2xl font-black uppercase text-[#0f172a] tracking-tight m-0 leading-none">ESTADO DE CUENTA</h1>
                    <h2 className="text-[10px] font-medium text-slate-500 m-0 mt-1">Reporte de Aportes Mensuales</h2>
                  </div>
                </div>
                
                <div className="w-full h-[3px] bg-[#0f172a] mb-6"></div>

                <div className="flex gap-4 mb-6 text-[10px] leading-relaxed">
                  <div className="flex-1 border border-blue-100 rounded-lg p-3 bg-white">
                    <h3 className="font-bold text-[11px] text-slate-800 border-b border-slate-200 mb-2 pb-1">Datos del Cliente</h3>
                    <div className="grid grid-cols-[110px_1fr] gap-y-1.5">
                      <span className="text-slate-500">Cliente:</span><span className="font-bold uppercase text-slate-800">{activeClient.nombres}</span>
                      <span className="text-slate-500">Identificación:</span><span className="text-slate-800">{activeClient.docIdentidad}</span>
                      <span className="text-slate-500">Grupo / Código:</span><span className="text-slate-800">{activeClient.grupoCodigo}</span>
                      <span className="text-slate-500">Ejecutivo Asignado:</span><span className="font-bold text-slate-800">{activeClient.ejecutivoCartera}</span>
                    </div>
                  </div>
                  <div className="flex-1 border border-blue-100 rounded-lg p-3 bg-white">
                    <h3 className="font-bold text-[11px] text-slate-800 border-b border-slate-200 mb-2 pb-1">Información del Plan</h3>
                    <div className="grid grid-cols-[110px_1fr] gap-y-1.5">
                      <span className="text-slate-500">Tipo de Plan:</span><span className="text-slate-800">{activeClient.tipoPlan}</span>
                      <span className="text-slate-500">Estado:</span><span className="font-bold text-emerald-600">{activeClient.estadoPlan} {activeClient.formaAdjudicacion ? `(${activeClient.formaAdjudicacion})` : ''}</span>
                      <span className="text-slate-500">Plazo Contrato:</span><span className="text-slate-800">{activeClient.plazoPlan} Meses</span>
                      <span className="text-slate-500">F. Adjudicación:</span><span className="text-slate-800">{activeClient.fechaAdjudicacion ? formatD(activeClient.fechaAdjudicacion) : 'N/A'}</span>
                      <span className="text-slate-500">Día de Pago:</span><span className="font-bold text-blue-800">5 de cada mes</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 mb-6">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-center flex flex-col justify-center">
                    <span className="text-[8px] font-bold text-blue-800 uppercase mb-0.5">MONTO BASE</span>
                    <span className="font-black text-slate-800 text-[13px]">${activeClient.montoContratado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-center flex flex-col justify-center">
                    <span className="text-[8px] font-bold text-blue-800 uppercase mb-0.5">CUOTA MENSUAL</span>
                    <span className="font-black text-slate-800 text-[13px]">${activeClient.valorCuota.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-center flex flex-col justify-center">
                    <span className="text-[8px] font-bold text-blue-800 uppercase mb-0.5">INSCRIPCIÓN</span>
                    <span className="font-black text-slate-800 text-[13px]">${activeClient.valorInscripcion.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="bg-blue-600 rounded-lg p-2 text-center flex flex-col justify-center text-white">
                    <span className="text-[8px] font-bold uppercase mb-0.5 text-blue-100">TOTAL PLAN</span>
                    <span className="font-black text-[14px]">${(activeClient.valorCuota * activeClient.plazoPlan).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <table className="w-full text-center border-collapse text-[9px] mb-6">
                  <thead className="bg-[#0f172a] text-white uppercase tracking-wider">
                    <tr>
                      <th className="py-2 px-1">#</th><th className="py-2 px-1 text-right">SALDO INICIAL</th><th className="py-2 px-1 text-center">CUOTA MENSUAL</th>
                      <th className="py-2 px-1 text-center">ABONO MENSUAL</th><th className="py-2 px-1 text-right">SALDO CUOTA</th><th className="py-2 px-1 text-right">SALDO PLAN</th>
                      <th className="py-2 px-1 text-center">VENCIMIENTO</th><th className="py-2 px-1 text-center">F. PAGO</th><th className="py-2 px-1 text-center">DÍAS</th>
                      <th className="py-2 px-1 text-center">ESTADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculatedRows.map(row => (
                      <tr key={row.i} className="border-b border-slate-200">
                        <td className="py-1.5 px-1 font-bold text-slate-800">{row.i}</td>
                        <td className="py-1.5 px-1 text-right text-slate-500">${row.saldoInicial.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                        <td className="py-1.5 px-1 text-center text-slate-700">${row.cuotaVal.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                        <td className="py-1.5 px-1 text-center text-slate-700">${row.abonoVal.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                        <td className="py-1.5 px-1 text-right text-slate-400">${row.saldoCuota.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                        <td className="py-1.5 px-1 text-right font-bold text-blue-900">${row.saldoPlan.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                        <td className="py-1.5 px-1 text-center text-slate-600">{formatD(row.currentVenc)}</td>
                        <td className="py-1.5 px-1 text-center text-slate-600">{row.isPaid ? formatD(row.currentPago) : ''}</td>
                        <td className="py-1.5 px-1 text-center text-slate-500">{row.diasCalculados > 0 ? row.diasCalculados : '0'}</td>
                        <td className="py-1.5 px-1 text-center">
                          <span className={`inline-block w-full py-0.5 ${row.rowBadgeClass} ${row.rowStatusClass} text-[8px]`}>{row.rowStatus}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-end mt-4">
                  <div className="w-64 border border-blue-100 bg-blue-50 p-4 rounded-lg">
                    <h3 className="font-bold border-b border-blue-100 pb-1 mb-2 text-[10px] text-blue-900 uppercase">Resumen Final</h3>
                    <div className="flex justify-between mb-1.5 text-[9px]"><span className="font-medium text-slate-600">Cuotas Canceladas:</span><span className="font-bold text-slate-800">{canceladasCount}</span></div>
                    <div className="flex justify-between mb-1.5 text-[9px]"><span className="font-medium text-slate-600">Total Cancelado:</span><span className="font-bold text-emerald-600">${totalCancelado.toLocaleString('en-US', {minimumFractionDigits:2})}</span></div>
                    <div className="flex justify-between mb-1.5 text-[9px]"><span className="font-medium text-slate-600">Cuotas Pendientes:</span><span className="font-bold text-slate-800">{activeClient.plazoPlan - canceladasCount}</span></div>
                    <div className="flex justify-between pt-1.5 border-t border-slate-200 mt-1.5 text-[10px]"><span className="font-bold text-slate-800 uppercase">Total Pendiente:</span><span className="font-black text-slate-800">${runningSaldoPlan.toLocaleString('en-US', {minimumFractionDigits:2})}</span></div>
                  </div>
                </div>
                
                <div className="text-[8px] text-slate-400 mt-6 text-right font-medium">
                  Generado el {new Date().toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })} a las {new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })()}

        {}
        {activeTab === 'mora-cobranzas' && activeClient && (
          <div className="bg-white shadow-lg rounded-xl border border-slate-100 p-6 print:hidden max-w-[1300px] mx-auto">
            <div className="flex justify-between items-center mb-6">
              <div className="flex gap-4 items-center">
                <span className="font-medium text-slate-500">Cliente: <span className="font-bold text-slate-800 uppercase ml-1">{activeClient.nombres}</span></span>
                <span className="font-medium text-slate-500">Plan: <span className="font-semibold text-slate-700 ml-1">{activeClient.tipoPlan} - {activeClient.estadoPlan}</span></span>
                <span className="font-medium text-slate-500">Estado: <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800 font-bold uppercase text-xs ml-1">{activeClient.estadoActivo}</span></span>
              </div>
              <div className="flex gap-4 items-center">
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded border border-blue-200">
                  <label className="text-xs font-bold text-blue-800">Fecha Cálculo:</label>
                  <input type="date" value={fechaCalculoMora} onChange={(e) => { setFechaCalculoMora(e.target.value); syncToFirebase({ fechaCalculoMora: e.target.value }); }} className="bg-transparent text-blue-900 font-bold text-xs outline-none" />
                </div>
                <button onClick={() => window.print()} className="px-4 py-1.5 bg-blue-50 text-blue-600 rounded font-bold border border-blue-200 text-xs">Imprimir</button>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-4 mb-6 text-sm">
              <div className="p-3 border rounded border-slate-200"><p className="text-slate-400 text-[10px] font-bold uppercase">GRUPO / CÓDIGO</p><p className="font-bold text-slate-700">{activeClient.grupoCodigo}</p></div>
              <div className="p-3 border rounded border-slate-200"><p className="text-slate-400 text-[10px] font-bold uppercase">MONTO CONTRATADO</p><p className="font-bold text-slate-700">${activeClient.montoContratado.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</p></div>
              <div className="p-3 border rounded border-slate-200"><p className="text-slate-400 text-[10px] font-bold uppercase">PLAZO CONTRATO</p><p className="font-bold text-slate-700">{activeClient.plazoPlan} Meses</p></div>
              <div className="p-3 border rounded border-slate-200"><p className="text-slate-400 text-[10px] font-bold uppercase">TOTAL CUOTAS</p><p className="font-bold text-slate-700">${(activeClient.valorCuota * activeClient.plazoPlan).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</p></div>
              <div className="p-3 border rounded border-slate-200"><p className="text-slate-400 text-[10px] font-bold uppercase">DÍA DE PAGO</p><p className="font-bold text-blue-700">5 de cada mes</p></div>
            </div>

            <div className="grid grid-cols-12 gap-8">
              <div className="col-span-12 md:col-span-4 space-y-6">
                <div className="border border-slate-200 rounded p-4">
                  <h4 className="font-bold text-slate-800 mb-4 text-sm">Tasa Administrativa Anual</h4>
                  <div className="flex gap-4">
                    <div className="border border-slate-200 p-2 rounded flex-1">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">AÑOS DEL PLAN</p>
                      <p className="font-bold text-sm">{(activeClient.plazoPlan / 12).toFixed(2)} Años</p>
                    </div>
                    <div className="border border-blue-200 bg-blue-50 p-2 rounded flex-1">
                      <p className="text-[10px] text-blue-600 font-bold uppercase">TASA ANUAL</p>
                      <p className="font-bold text-blue-800 text-sm">
                        {activeClient.estadoPlan === 'Adjudicado' ? `${tasaAdministrativa.toFixed(2)}%` : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded p-4 shadow-sm bg-white">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-bold text-slate-800 text-sm">Parámetros de MORA</h4>
                    <button onClick={addMoraParam} className="text-blue-600 hover:text-blue-800 text-xs font-semibold">+ Fila</button>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-3">Interés Compuesto calculando la Tasa Diaria basada en Recargo Anual / 365.</p>
                  <table className="w-full text-xs text-center border-separate border-spacing-y-1">
                    <thead className="bg-slate-100 text-slate-600 font-bold">
                      <tr><th className="p-2 rounded-l">Días Min</th><th className="p-2">Días Max</th><th className="p-2">T. Anual %</th><th className="p-2 rounded-r">T. Diaria %</th><th className="w-6"></th></tr>
                    </thead>
                    <tbody>
                      {moraParams.map((p, idx) => {
                        const recargo = tasaAdministrativa * (p.tasaAnual / 100);
                        const nuevaTasaAnual = tasaAdministrativa + recargo;
                        const tasaDiaria = nuevaTasaAnual / 365;
                        return (
                          <tr key={idx}>
                            <td><input type="number" value={p.diasMin} onChange={(e) => updateMoraParam(idx, 'diasMin', Number(e.target.value))} className="w-full border rounded p-1.5 text-center outline-none" /></td>
                            <td><input type="number" value={p.diasMax} onChange={(e) => updateMoraParam(idx, 'diasMax', Number(e.target.value))} className="w-full border rounded p-1.5 text-center outline-none" /></td>
                            <td><input type="number" step="0.1" value={p.tasaAnual} onChange={(e) => updateMoraParam(idx, 'tasaAnual', Number(e.target.value))} className="w-full border rounded p-1.5 text-center outline-none bg-blue-50" /></td>
                            <td className="font-semibold text-slate-700 bg-slate-50 border border-transparent">{tasaDiaria.toFixed(4)}%</td>
                            <td><button onClick={() => removeMoraParam(idx)} className="text-red-400 font-bold hover:text-red-600">X</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="border border-slate-200 rounded p-4 shadow-sm bg-white">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-bold text-slate-800 text-sm">Parámetros de COBRANZAS</h4>
                    <button onClick={addCobranzaParam} className="text-blue-600 hover:text-blue-800 text-xs font-semibold">+ Fila</button>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-3">Aplica a partir del Día 16 de atraso. (Basado en Saldo Cuota)</p>
                  <table className="w-full text-xs text-center border-separate border-spacing-y-1">
                    <thead className="bg-slate-100 text-slate-600 font-bold">
                      <tr><th className="p-2 rounded-l">Saldo Min $</th><th className="p-2">Saldo Max $</th><th className="p-2 rounded-r">Valor $</th><th className="w-6"></th></tr>
                    </thead>
                    <tbody>
                      {cobranzaParams.map((p, idx) => (
                        <tr key={idx}>
                          <td><input type="number" step="0.01" value={p.saldoMin} onChange={(e) => updateCobranzaParam(idx, 'saldoMin', Number(e.target.value))} className="w-full border rounded p-1.5 text-center outline-none" /></td>
                          <td><input type="number" step="0.01" value={p.saldoMax} onChange={(e) => updateCobranzaParam(idx, 'saldoMax', Number(e.target.value))} className="w-full border rounded p-1.5 text-center outline-none" /></td>
                          <td><input type="number" step="0.01" value={p.valor} onChange={(e) => updateCobranzaParam(idx, 'valor', Number(e.target.value))} className="w-full border rounded p-1.5 text-center outline-none" /></td>
                          <td><button onClick={() => removeCobranzaParam(idx)} className="text-red-400 font-bold hover:text-red-600">X</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="col-span-12 md:col-span-8 space-y-6">
                <div className="border border-slate-200 rounded shadow-sm overflow-hidden bg-white">
                  <table className="w-full text-xs text-center">
                    <thead className="bg-[#1e293b] text-white">
                      <tr>
                        <th className="p-2 text-[10px]">CUOTA</th><th className="p-2 text-[10px]">VENCE</th><th className="p-2 text-[10px]">DÍAS</th>
                        <th className="p-2 text-[10px]">SALDO</th><th className="p-2 text-[10px] text-amber-400">MORA</th>
                        <th className="p-2 text-[10px] text-emerald-400">% DESC M.</th><th className="p-2 text-[10px] text-red-400">COBRANZA</th>
                        <th className="p-2 text-[10px] text-emerald-400">% DESC C.</th><th className="p-2 text-[10px] text-blue-300">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pendingQuotas.map((q) => (
                        <tr key={q.num} className="hover:bg-slate-50">
                          <td className="p-2 font-bold">{q.num}</td>
                          <td className="p-2">{q.vencimientoStr}</td>
                          <td className="p-2 font-bold text-red-500">{q.daysLate}</td>
                          <td className="p-2 font-bold">${q.saldo.toFixed(2)}</td>
                          <td className="p-2 font-bold text-amber-500">${q.moraBase.toFixed(2)}</td>
                          <td className="p-2">
                            <input type="number" min="0" max="100" value={q.descM} onChange={(e) => {
                              const val = Number(e.target.value);
                              setDescMora((prev) => { const next = { ...prev, [q.num]: val }; syncToFirebase({ descMora: next }); return next; });
                            }} className="w-12 text-center border rounded outline-none p-1 text-emerald-600 font-bold bg-emerald-50" />
                          </td>
                          <td className="p-2 font-bold text-red-500">${q.cobranzaBase.toFixed(2)}</td>
                          <td className="p-2">
                            <input type="number" min="0" max="100" value={q.descC} onChange={(e) => {
                              const val = Number(e.target.value);
                              setDescCobranza((prev) => { const next = { ...prev, [q.num]: val }; syncToFirebase({ descCobranza: next }); return next; });
                            }} className="w-12 text-center border rounded outline-none p-1 text-emerald-600 font-bold bg-emerald-50" />
                          </td>
                          <td className="p-2 font-black text-blue-900">${q.totalRow.toFixed(2)}</td>
                        </tr>
                      ))}
                      {pendingQuotas.length === 0 && (
                        <tr><td colSpan={9} className="p-4 text-slate-400 font-medium text-sm">No hay cuotas atrasadas registradas hasta la fecha de cálculo.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="border border-slate-200 rounded p-6 shadow-sm bg-white">
                  <h3 className="font-bold text-slate-800 text-lg mb-4">Resumen a Pagar</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-600 font-medium">Subtotal Cuotas Vencidas:</span>
                      <span className="font-bold text-slate-800">${subtotalVencidas.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-600 font-medium">Subtotal Mora (Con desc):</span>
                      <span className="font-bold text-amber-500">${subtotalMora.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-600 font-medium">Subtotal Cobranzas (Con desc):</span>
                      <span className="font-bold text-red-500">${subtotalCobranzas.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-2">
                      <span className="font-black text-slate-900 text-lg uppercase tracking-wider">TOTAL GENERAL:</span>
                      <span className="font-black text-blue-700 text-2xl">${(subtotalVencidas + subtotalMora + subtotalCobranzas).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded p-5 shadow-sm bg-white">
                  <h4 className="font-bold text-slate-800 mb-3 text-sm">Historial de Gestiones</h4>
                  <div className="mb-3">
                    <textarea rows={2} value={nuevaGestion} onChange={(e) => setNuevaGestion(e.target.value)} placeholder="Ingrese los detalles de la gestión, acuerdos o llamadas realizadas..." className="w-full rounded border-slate-300 p-2 border text-sm outline-none focus:border-blue-400" />
                    <div className="mt-2 flex justify-end">
                      <button onClick={guardarGestion} className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-bold">+ Guardar Gestión</button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                    {(gestiones[activeClient.id] || []).map((g, idx) => (
                      <div key={idx} className="bg-slate-50 p-2 rounded border border-slate-200 text-xs"><span className="font-bold text-slate-400 block mb-0.5 text-[10px]">{g.fecha}</span><p className="text-slate-700">{g.texto}</p></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {}
        {activeTab === 'reportes' && (
          <div className="bg-white shadow-lg rounded-xl border border-slate-100 p-6 print:hidden">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b border-slate-200 pb-4">Reportes y Productividad</h2>
            
            <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div><label className="block text-xs font-bold text-slate-700 mb-1">Buscar Cliente</label><input type="text" value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Nombre o ID..." className="w-full rounded border-slate-300 p-2 border text-sm" /></div>
              <div><label className="block text-xs font-bold text-slate-700 mb-1">Estado</label><select value={reportFilterEstado} onChange={(e) => setReportFilterEstado(e.target.value)} className="w-full rounded border-slate-300 p-2 border bg-white text-sm"><option value="Todos">Todos</option><option value="Adjudicado">Adjudicado</option><option value="No Adjudicado">No Adjudicado</option></select></div>
              <div><label className="block text-xs font-bold text-slate-700 mb-1">Ejecutivo</label><select value={reportFilterEjecutivo} onChange={(e) => setReportFilterEjecutivo(e.target.value)} className="w-full rounded border-slate-300 p-2 border bg-white text-sm"><option value="Todos">Todos</option>{Array.from(new Set(clients.map((c) => c.ejecutivoCartera))).map((ej) => (<option key={ej} value={ej}>{ej}</option>))}</select></div>
              <div><label className="block text-xs font-bold text-slate-700 mb-1">Vencidas (Min)</label><input type="number" min="0" value={reportFilterVencidas} onChange={(e) => setReportFilterVencidas(e.target.value)} className="w-full rounded border-slate-300 p-2 border text-sm" /></div>
            </div>

            <div className="mb-8">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-bold text-slate-700">Reporte General</h3>
                <button onClick={() => exportToExcel('general')} className="px-4 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 font-bold text-xs flex items-center">Descargar Excel</button>
              </div>
              <div className="table-container overflow-x-auto border border-slate-200 rounded max-h-[500px]">
                <table className="min-w-full divide-y divide-slate-200 text-xs whitespace-nowrap text-center">
                  <thead className="bg-slate-800 text-white font-bold sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left">CLIENTE</th><th className="px-2 py-2 text-left">IDENTIFICACIÓN</th><th className="px-2 py-2 text-left">GRUPO/PLAN</th>
                      <th className="px-2 py-2 text-right">MONTO</th><th className="px-2 py-2 text-center">ESTADO</th><th className="px-2 py-2 text-right">CUOTA MES</th>
                      <th className="px-2 py-2 text-red-600 bg-red-100">VENCIDAS</th><th className="px-2 py-2 text-red-600 bg-red-100">VALOR VENCIDO</th>
                      <th className="px-2 py-2 text-blue-300">PAGADAS (TOTAL)</th><th className="px-2 py-2 text-emerald-600 bg-emerald-100">COBRADAS (MES)</th>
                      <th className="px-2 py-2 text-emerald-600 bg-emerald-100">RECAUDO (MES)</th><th className="px-2 py-2 text-amber-600 bg-amber-100">PENDIENTES</th>
                      <th className="px-2 py-2 text-amber-600 bg-amber-100">VALOR PENDIENTE</th><th className="px-2 py-2 text-left">EJECUTIVO</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {filteredReportClients.map((c) => {
                      const vencidas = calculateVencidas(c);
                      const valVencido = vencidas * c.valorCuota;
                      const pagadasTotales = c.cuotasPagadas;
                      
                      let cobradasMes = 0;
                      const calcDate = new Date(fechaCalculoMora);
                      if (customCuotas[c.id]) {
                        Object.values(customCuotas[c.id]).forEach((cuota) => {
                          if (cuota.fechaPago && cuota.abonoVal > 0) {
                            const d = new Date(cuota.fechaPago);
                            if (d.getMonth() === calcDate.getMonth() && d.getFullYear() === calcDate.getFullYear()) {
                              cobradasMes++;
                            }
                          }
                        });
                      }
                      const recaudoMes = cobradasMes * c.valorCuota;
                      const pendientes = c.plazoPlan - c.cuotasPagadas;
                      const valPendiente = pendientes * c.valorCuota;

                      return (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="px-2 py-2 font-medium text-left">{c.nombres}</td><td className="px-2 py-2 text-left">{c.docIdentidad}</td>
                          <td className="px-2 py-2 text-left">{c.grupoCodigo}</td><td className="px-2 py-2 font-medium text-right">${c.montoContratado.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</td>
                          <td className="px-2 py-2 text-center"><span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold text-[10px]">{c.estadoPlan}</span></td>
                          <td className="px-2 py-2 font-medium text-right">${c.valorCuota.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</td>
                          <td className="px-2 py-2 font-bold text-red-600 bg-red-50">{vencidas}</td><td className="px-2 py-2 font-bold text-red-600 bg-red-50 text-right">${valVencido.toFixed(2)}</td>
                          <td className="px-2 py-2 font-bold text-blue-600 border-l border-slate-100">{pagadasTotales}</td><td className="px-2 py-2 font-bold text-emerald-600 bg-emerald-50">{cobradasMes}</td>
                          <td className="px-2 py-2 font-bold text-emerald-600 bg-emerald-50 text-right">${recaudoMes.toFixed(2)}</td><td className="px-2 py-2 font-bold text-amber-600 bg-amber-50 border-l border-slate-100">{pendientes}</td>
                          <td className="px-2 py-2 font-bold text-amber-600 bg-amber-50 text-right">${valPendiente.toFixed(2)}</td><td className="px-2 py-2 text-left border-l border-slate-100">{c.ejecutivoCartera}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-bold text-slate-700">Recaudación por Ejecutivo</h3>
                <button onClick={() => exportToExcel('ejecutivos')} className="px-4 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 font-bold text-xs">Descargar Excel</button>
              </div>
              <div className="table-container overflow-x-auto border border-slate-200 rounded max-w-2xl">
                <table className="min-w-full divide-y divide-slate-200 text-sm whitespace-nowrap">
                  <thead className="bg-[#1e293b] text-white">
                    <tr><th className="px-4 py-2 text-left font-bold text-xs">EJECUTIVO DE CARTERA</th><th className="px-4 py-2 text-center font-bold text-xs">TOTAL CLIENTES</th><th className="px-4 py-2 text-right font-bold text-xs text-emerald-400">RECAUDO (MES)</th></tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {Array.from(new Set(clients.map((c) => c.ejecutivoCartera))).map((ej) => {
                      const ejClients = clients.filter((c) => c.ejecutivoCartera === ej);
                      const totalRecaudo = ejClients.reduce((acc, curr) => acc + (curr.cuotasPagadas * curr.valorCuota), 0);
                      return (
                        <tr key={ej} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-bold">{ej}</td><td className="px-4 py-2 text-center font-medium">{ejClients.length}</td>
                          <td className="px-4 py-2 text-right text-emerald-600 font-bold">${totalRecaudo.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL CONFIRMACION GLOBAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-60 z-50 flex items-center justify-center print:hidden backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-center text-slate-900 mb-2">Confirmar Acción</h3>
            <p className="text-sm text-slate-500 text-center mb-6">{confirmModalMessage}</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setShowConfirmModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md font-bold text-sm hover:bg-slate-200">Cancelar</button>
              <button onClick={() => { if (onConfirmAction) onConfirmAction(); }} className="px-4 py-2 bg-blue-600 text-white rounded-md font-bold text-sm shadow hover:bg-blue-700">Aceptar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
