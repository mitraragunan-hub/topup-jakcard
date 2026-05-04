// @ts-nocheck
import React, { useState, useMemo, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, setDoc } from 'firebase/firestore';

// ==========================================
// KONFIGURASI FIREBASE (MENDUKUNG VERCEL & CANVAS)
// ==========================================
let app, auth, db, appId;

try {
  if (typeof __firebase_config !== 'undefined') {
    const firebaseConfig = JSON.parse(__firebase_config);
    app = initializeApp(firebaseConfig);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'tmr-ragunan-cloud';
  } else {
    const firebaseConfig = {
      apiKey: "AIzaSyBK1hpOkoZBr0HXAlP-VxRz2Myw94QNKfU",
      authDomain: "transaksi-dfccb.firebaseapp.com",
      projectId: "transaksi-dfccb",
      storageBucket: "transaksi-dfccb.firebasestorage.app",
      messagingSenderId: "357946401060",
      appId: "1:357946401060:web:ea551d54fedbf6e7eed3b1"
    };
    app = initializeApp(firebaseConfig);
    appId = 'tmr-ragunan-production';
  }
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase Initialization Error:", e);
}

export default function App() {
  // ==========================================
  // JALAN PINTAS UNTUK MENGAKTIFKAN DESAIN SECARA PAKSA
  // ==========================================
  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }
  }, []);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('input');
  
  const [user, setUser] = useState(null);
  const [isLoadingDB, setIsLoadingDB] = useState(true);

  const [petugasList, setPetugasList] = useState([]);
  const [lokasiList, setLokasiList] = useState([]);
  const [penandatangan, setPenandatangan] = useState({ bendahara: '', pemeriksa: '' });

  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    nama: '', lokasi: '', topupDisplay: '', topupRaw: 0, tk20: '', tk50: '', ntk20: '', ntk50: '', ket: ''
  });

  const [editingId, setEditingId] = useState(null);
  const [extraData, setExtraData] = useState({ ecarDisplay: '', ecarRaw: 0, ecarTrx: 0, fotoDisplay: '', fotoRaw: 0, fotoTrx: 0 });

  const [filter, setFilter] = useState({ 
    startDate: new Date().toISOString().split('T')[0], 
    endDate: new Date().toISOString().split('T')[0], 
    sesi: '', lokasi: '', petugas: '' 
  });
  const [sortConfig, setSortConfig] = useState({ key: 'tanggal', direction: 'desc' });

  const [records, setRecords] = useState([]);

  useEffect(() => {
    const initAuth = async () => {
      if (!auth) {
        setIsLoadingDB(false);
        return;
      }
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { 
        console.error("Auth Error:", err); 
        setIsLoadingDB(false); 
      }
    };
    initAuth();

    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsLoadingDB(false); 
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    const masterDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'master');
    const unsubMaster = onSnapshot(masterDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.petugas) setPetugasList(data.petugas);
        if (data.lokasi) setLokasiList(data.lokasi);
        if (data.penandatangan) setPenandatangan(data.penandatangan);
      } else {
        setDoc(masterDocRef, {
          petugas: ['Irma Khotimah', 'Arif Nurdiansah', 'Aldi Priadi Ekapaksi'],
          lokasi: ['TOL UTARA', 'Barat Kendaraan', 'Motor Utara'],
          penandatangan: { bendahara: 'Evi Irmawati', pemeriksa: 'Hermawati' }
        }).catch(err => console.log("Gagal inisiasi Master DB", err));
      }
    }, (error) => {
       console.error("Gagal membaca Master DB:", error);
    });

    const recordsRef = collection(db, 'artifacts', appId, 'public', 'data', 'records');
    const unsubRecords = onSnapshot(recordsRef, (snapshot) => {
      const recs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecords(recs);
    });

    const extraRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_extra', filter.startDate);
    const unsubExtra = onSnapshot(extraRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setExtraData({
          ecarRaw: data.ecarRaw || 0, ecarTrx: data.ecarTrx || 0,
          ecarDisplay: data.ecarRaw ? new Intl.NumberFormat('id-ID').format(data.ecarRaw) : '',
          fotoRaw: data.fotoRaw || 0, fotoTrx: data.fotoTrx || 0,
          fotoDisplay: data.fotoRaw ? new Intl.NumberFormat('id-ID').format(data.fotoRaw) : ''
        });
      } else {
        setExtraData({ ecarDisplay: '', ecarRaw: 0, ecarTrx: 0, fotoDisplay: '', fotoRaw: 0, fotoTrx: 0 });
      }
    });

    return () => { unsubMaster(); unsubRecords(); unsubExtra(); };
  }, [user, filter.startDate]);

  const HARGA_K20 = 45000;
  const HARGA_K50 = 75000;
  const formatRp = (angka) => new Intl.NumberFormat('id-ID').format(angka || 0);
  const getRowTotal = (row) => (row.topup || 0) + ((row.tk20 || 0) * HARGA_K20) + ((row.tk50 || 0) * HARGA_K50);
  const getActiveSesi = () => new Date().getHours() >= 20 ? 'Malam' : 'Siang';
  
  const formatTanggalIndonesia = (dateString) => {
    if(!dateString) return '';
    const date = new Date(dateString);
    const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${hari[date.getDay()]}, ${date.getDate()} ${bulan[date.getMonth()]} ${date.getFullYear()}`;
  };

  const updateMasterDB = async (payload) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'master'), payload, { merge: true });
    } catch (error) {
      console.error("Gagal Simpan Master DB:", error);
      alert("⚠️ GAGAL MENYIMPAN KE DATABASE!");
    }
  };

  const [newPetugas, setNewPetugas] = useState('');
  const [newLokasi, setNewLokasi] = useState('');
  const [editLokasiIdx, setEditLokasiIdx] = useState(null);
  const [editLokasiValue, setEditLokasiValue] = useState('');
  const [editPetugasIdx, setEditPetugasIdx] = useState(null);
  const [editPetugasValue, setEditPetugasValue] = useState('');

  const addPetugas = () => { if(newPetugas) { updateMasterDB({ petugas: [...petugasList, newPetugas] }); setNewPetugas(''); }};
  const addLokasi = () => { if(newLokasi) { updateMasterDB({ lokasi: [...lokasiList, newLokasi] }); setNewLokasi(''); }};
  const delPetugas = (idx) => updateMasterDB({ petugas: petugasList.filter((_, i) => i !== idx) });
  const delLokasi = (idx) => updateMasterDB({ lokasi: lokasiList.filter((_, i) => i !== idx) });

  const startEditLokasi = (idx) => { setEditLokasiIdx(idx); setEditLokasiValue(lokasiList[idx]); };
  const saveEditLokasi = (idx) => { 
    const newList = [...lokasiList]; newList[idx] = editLokasiValue; 
    updateMasterDB({ lokasi: newList }); setEditLokasiIdx(null); 
  };
  
  const startEditPetugas = (idx) => { setEditPetugasIdx(idx); setEditPetugasValue(petugasList[idx]); };
  const saveEditPetugas = (idx) => { 
    const newList = [...petugasList]; newList[idx] = editPetugasValue; 
    updateMasterDB({ petugas: newList }); setEditPetugasIdx(null); 
  };

  const handleEdit = (record) => {
    setFormData({
      tanggal: record.tanggal, nama: record.nama, lokasi: record.lokasi,
      topupDisplay: record.topup ? formatRp(record.topup) : '', topupRaw: record.topup || 0,
      tk20: record.tk20 || '', tk50: record.tk50 || '', ntk20: record.ntk20 || '', ntk50: record.ntk50 || '', ket: record.ket || ''
    });
    setEditingId(record.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData(prev => ({ ...prev, nama: '', lokasi: '', topupDisplay: '', topupRaw: 0, tk20: '', tk50: '', ntk20: '', ntk50: '', ket: '' }));
  };

  const handleExtraChange = async (e) => {
    if (!user) return;
    const { name, value } = e.target;
    if (name === 'ecarDisplay' || name === 'fotoDisplay') {
      const rawValue = value.replace(/\D/g, '');
      const rawNumber = Number(rawValue);
      const rawKey = name.replace('Display', 'Raw');
      const trxKey = name.replace('Display', 'Trx');
      const trxValue = name === 'ecarDisplay' ? (rawNumber / 250000) : (rawNumber / 5000);
      
      try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'daily_extra', filter.startDate), {
          [rawKey]: rawNumber, [trxKey]: trxValue
        }, { merge: true });
      } catch (error) {
         console.error("Gagal simpan Ecar/Foto:", error);
      }
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'topupDisplay') {
      const rawValue = value.replace(/\D/g, '');
      const rawNumber = Number(rawValue);
      setFormData(prev => ({ ...prev, topupDisplay: rawValue ? formatRp(rawNumber) : '', topupRaw: rawNumber }));
    } else { setFormData(prev => ({ ...prev, [name]: value })); }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    const payload = {
      tanggal: formData.tanggal, nama: formData.nama, lokasi: formData.lokasi,
      topup: formData.topupRaw, ket: formData.ket,
      tk20: Number(formData.tk20) || 0, tk50: Number(formData.tk50) || 0,
      ntk20: Number(formData.ntk20) || 0, ntk50: Number(formData.ntk50) || 0,
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'records', editingId), payload);
        setEditingId(null);
      } else {
        const now = new Date();
        payload.jam_input = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        payload.sesi = getActiveSesi();
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'records'), payload);
      }
      setFormData(prev => ({ ...prev, nama: '', lokasi: '', topupDisplay: '', topupRaw: 0, tk20: '', tk50: '', ntk20: '', ntk50: '', ket: '' }));
      alert("✅ Data berhasil disimpan!");
    } catch (error) {
      console.error("Gagal input setoran:", error);
      alert("⚠️ GAGAL MENYIMPAN KE CLOUD!");
    }
  };
  
  const hapusData = async (id) => { 
    if (!user) return;
    if(window.confirm('Hapus data ini dari cloud?')) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'records', id)); 
      } catch (error) {
        alert("⚠️ Gagal menghapus!");
      }
    }
  };

  const filteredAndSortedRecords = useMemo(() => {
    let result = [...records];
    if (filter.startDate) result = result.filter(r => r.tanggal >= filter.startDate);
    if (filter.endDate) result = result.filter(r => r.tanggal <= filter.endDate);
    if (filter.sesi) result = result.filter(r => r.sesi === filter.sesi);
    if (filter.lokasi) result = result.filter(r => r.lokasi === filter.lokasi);
    if (filter.petugas) result = result.filter(r => r.nama === filter.petugas);

    result.sort((a, b) => {
      let valA = a[sortConfig.key] || ''; let valB = b[sortConfig.key] || '';
      if (sortConfig.key === 'total') { valA = getRowTotal(a); valB = getRowTotal(b); }
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [records, filter, sortConfig]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const calculateSums = (dataToCalculate) => {
    return dataToCalculate.reduce((acc, row) => ({
      topup: acc.topup + (row.topup || 0),
      tk20: acc.tk20 + (row.tk20 || 0), tk50: acc.tk50 + (row.tk50 || 0),
      ntk20: acc.ntk20 + (row.ntk20 || 0), ntk50: acc.ntk50 + (row.ntk50 || 0),
      total: acc.total + getRowTotal(row)
    }), { topup: 0, tk20: 0, tk50: 0, ntk20: 0, ntk50: 0, total: 0 });
  };

  const currentSums = calculateSums(filteredAndSortedRecords);
  const todaySesiRecords = useMemo(() => records.filter(r => r.tanggal === formData.tanggal && r.sesi === getActiveSesi()), [records, formData.tanggal]);
  const livePreviewSums = calculateSums(todaySesiRecords);
  
  if (isLoadingDB) return (
    <div className="flex flex-col h-screen items-center justify-center bg-gray-50 text-indigo-800 font-bold text-xl animate-pulse">
      <svg className="w-12 h-12 mb-4 text-indigo-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
      Menghubungkan ke Cloud Database TMR...
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-800 overflow-hidden relative">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-green-800 text-white transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} print:hidden shadow-2xl`}>
        <div className="p-5 flex justify-between items-center border-b border-green-700">
          <h1 className="text-xl font-extrabold tracking-wider">TMR CLOUD</h1>
          <button onClick={() => setIsSidebarOpen(false)} className="text-white hover:text-gray-300 focus:outline-none transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <nav className="p-4 space-y-2 text-sm font-medium overflow-y-auto h-[calc(100vh-80px)] custom-scrollbar">
          <div className="text-green-300 uppercase text-xs font-bold mb-2 mt-4 px-2">Operasional</div>
          <button onClick={() => { setActiveTab('input'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${activeTab === 'input' ? 'bg-green-700 text-white' : 'text-green-100 hover:bg-green-700'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg> Input Setoran
          </button>
          
          <div className="text-green-300 uppercase text-xs font-bold mb-2 mt-6 px-2">Pencetakan</div>
          <button onClick={() => { setActiveTab('print1'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${activeTab === 'print1' ? 'bg-green-700 text-white' : 'text-green-100 hover:bg-green-700'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg> Cetak Tabel
          </button>
          <button onClick={() => { setActiveTab('print2'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${activeTab === 'print2' ? 'bg-green-700 text-white' : 'text-green-100 hover:bg-green-700'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Cetak Rekap
          </button>

          <div className="text-green-300 uppercase text-xs font-bold mb-2 mt-6 px-2">Sistem Database</div>
          <button onClick={() => { setActiveTab('laporan'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${activeTab === 'laporan' ? 'bg-green-700 text-white' : 'text-green-100 hover:bg-green-700'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg> Laporan & Analitik
          </button>
          <button onClick={() => { setActiveTab('master'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${activeTab === 'master' ? 'bg-green-700 text-white' : 'text-green-100 hover:bg-green-700'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg> Data Master
          </button>
        </nav>
      </aside>

      {isSidebarOpen && <div className="fixed inset-0 bg-gray-900 bg-opacity-50 z-40 print:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)}></div>}

      <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
        <header className="bg-white shadow-sm print:hidden flex items-center p-4 border-b z-10">
          <button onClick={() => setIsSidebarOpen(true)} className="mr-4 text-gray-700 hover:text-green-700 focus:outline-none transition transform hover:scale-105 bg-gray-100 p-2 rounded-md">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>
          
          <div className="flex justify-between items-center w-full">
            <h2 className="text-lg md:text-xl font-bold text-gray-800 capitalize">
              {activeTab === 'input' && 'Input Setoran Harian Cloud'}
              {activeTab === 'master' && 'Master Data Cloud'}
              {activeTab === 'print1' && 'Pencetakan Tabel Setoran'}
              {activeTab === 'print2' && 'Pencetakan Rekapitulasi'}
              {activeTab === 'laporan' && 'Laporan & Detil Transaksi'}
            </h2>
            <div className="hidden sm:flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
               <span className="relative flex h-3 w-3"><span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${user ? 'bg-green-400' : 'bg-yellow-400'}`}></span><span className={`relative inline-flex rounded-full h-3 w-3 ${user ? 'bg-green-500' : 'bg-yellow-500'}`}></span></span>
               <span className={`text-xs font-bold tracking-wide ${user ? 'text-green-800' : 'text-yellow-800'}`}>
                 {user ? 'Firebase Online' : 'Koneksi Offline (Guest)'}
               </span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8 bg-gray-50 print:p-0 print:bg-white print:overflow-visible">
          
          {/* TAB: DATA MASTER */}
          {activeTab === 'master' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
              <div className="bg-white p-5 rounded-xl shadow-md border-t-4 border-green-500">
                <h3 className="font-bold text-lg mb-4 text-green-700 border-b pb-2">Penanda Tangan</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1">Bendahara Penerima</label>
                    <input type="text" value={penandatangan.bendahara} onChange={e => { const v = e.target.value; setPenandatangan({...penandatangan, bendahara: v}); updateMasterDB({ penandatangan: {...penandatangan, bendahara: v} }); }} className="w-full border p-2 rounded bg-gray-50 outline-none focus:border-green-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">Petugas Pemeriksa</label>
                    <input type="text" value={penandatangan.pemeriksa} onChange={e => { const v = e.target.value; setPenandatangan({...penandatangan, pemeriksa: v}); updateMasterDB({ penandatangan: {...penandatangan, pemeriksa: v} }); }} className="w-full border p-2 rounded bg-gray-50 outline-none focus:border-green-400" />
                  </div>
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-md border-t-4 border-blue-500">
                <h3 className="font-bold text-lg mb-4 text-blue-700 border-b pb-2">Daftar Loket</h3>
                <div className="flex gap-2 mb-4">
                  <input type="text" value={newLokasi} onChange={e => setNewLokasi(e.target.value)} placeholder="Nama Loket Baru" className="flex-1 border p-2 rounded bg-gray-50 outline-none focus:border-blue-400" />
                  <button onClick={addLokasi} className="bg-blue-600 text-white px-4 rounded hover:bg-blue-700 font-bold">+</button>
                </div>
                <ul className="max-h-60 overflow-y-auto space-y-2 p-1 pr-2 custom-scrollbar">
                  {lokasiList.map((lok, i) => (
                    <li key={i} className="flex justify-between items-center bg-gray-50 p-3 border rounded shadow-sm hover:bg-white transition">
                      {editLokasiIdx === i ? (
                        <input type="text" value={editLokasiValue} onChange={(e) => setEditLokasiValue(e.target.value)} className="flex-1 border p-1 mr-2 rounded outline-none focus:border-blue-400 text-sm" autoFocus />
                      ) : ( <span className="text-sm font-medium">{lok}</span> )}
                      <div className="flex gap-1 ml-2">
                        {editLokasiIdx === i ? (
                          <>
                            <button onClick={() => saveEditLokasi(i)} className="text-green-600 font-bold text-xs bg-green-50 px-2 py-1 rounded">Simpan</button>
                            <button onClick={() => setEditLokasiIdx(null)} className="text-gray-500 font-bold text-xs bg-gray-100 px-2 py-1 rounded">Batal</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEditLokasi(i)} className="text-blue-500 font-bold text-xs bg-blue-50 px-2 py-1 rounded">Edit</button>
                            <button onClick={() => delLokasi(i)} className="text-red-500 font-bold text-xs bg-red-50 px-2 py-1 rounded">Hapus</button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-md border-t-4 border-orange-500">
                <h3 className="font-bold text-lg mb-4 text-orange-700 border-b pb-2">Daftar Petugas</h3>
                <div className="flex gap-2 mb-4">
                  <input type="text" value={newPetugas} onChange={e => setNewPetugas(e.target.value)} placeholder="Petugas Baru" className="flex-1 border p-2 rounded bg-gray-50 outline-none focus:border-orange-400" />
                  <button onClick={addPetugas} className="bg-orange-600 text-white px-4 rounded hover:bg-orange-700 font-bold">+</button>
                </div>
                <ul className="max-h-60 overflow-y-auto space-y-2 p-1 pr-2 custom-scrollbar">
                  {petugasList.map((pet, i) => (
                    <li key={i} className="flex justify-between items-center bg-gray-50 p-3 border rounded shadow-sm hover:bg-white transition">
                      {editPetugasIdx === i ? (
                        <input type="text" value={editPetugasValue} onChange={(e) => setEditPetugasValue(e.target.value)} className="flex-1 border p-1 mr-2 rounded outline-none text-sm" autoFocus />
                      ) : ( <span className="text-sm font-medium">{pet}</span> )}
                      <div className="flex gap-1 ml-2">
                        {editPetugasIdx === i ? (
                          <>
                            <button onClick={() => saveEditPetugas(i)} className="text-green-600 font-bold text-xs bg-green-50 px-2 py-1 rounded">Simpan</button>
                            <button onClick={() => setEditPetugasIdx(null)} className="text-gray-500 font-bold text-xs bg-gray-100 px-2 py-1 rounded">Batal</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEditPetugas(i)} className="text-orange-500 font-bold text-xs bg-orange-50 px-2 py-1 rounded">Edit</button>
                            <button onClick={() => delPetugas(i)} className="text-red-500 font-bold text-xs bg-red-50 px-2 py-1 rounded">Hapus</button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* TAB: INPUT FORM */}
          {activeTab === 'input' && (
            <div className="max-w-7xl mx-auto space-y-6">
              {/* SECTION 1: FORM UTAMA */}
              <div className="bg-white rounded-xl shadow-lg overflow-hidden border-t-4 border-green-600">
                <div className="p-6 md:p-10">
                  <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div><label className="block text-sm font-bold text-gray-700 mb-2">Tanggal Input</label><input type="date" name="tanggal" value={formData.tanggal} onChange={handleChange} required className="w-full border rounded-lg p-3 outline-none" /></div>
                      <div><label className="block text-sm font-bold text-gray-700 mb-2">Petugas</label><select name="nama" value={formData.nama} onChange={handleChange} required className="w-full border rounded-lg p-3 outline-none"><option value="">-- Pilih --</option>{petugasList.map((p, i) => <option key={i} value={p}>{p}</option>)}</select></div>
                      <div><label className="block text-sm font-bold text-gray-700 mb-2">Lokasi</label><select name="lokasi" value={formData.lokasi} onChange={handleChange} required className="w-full border rounded-lg p-3 outline-none"><option value="">-- Pilih --</option>{lokasiList.map((l, i) => <option key={i} value={l}>{l}</option>)}</select></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 shadow-inner"><h3 className="text-base font-bold text-blue-900 mb-4 border-b pb-2">Tunai (Qty)</h3><div className="flex gap-6"><div className="w-1/2"><label className="block text-sm mb-2">K.20</label><input type="number" name="tk20" value={formData.tk20} onChange={handleChange} className="w-full border rounded-lg p-3 outline-none text-center font-bold" /></div><div className="w-1/2"><label className="block text-sm mb-2">K.50</label><input type="number" name="tk50" value={formData.tk50} onChange={handleChange} className="w-full border rounded-lg p-3 outline-none text-center font-bold" /></div></div></div>
                      <div className="bg-orange-50 p-6 rounded-xl border border-orange-100 shadow-inner"><h3 className="text-base font-bold text-orange-900 mb-4 border-b pb-2">Non-Tunai (Qty)</h3><div className="flex gap-6"><div className="w-1/2"><label className="block text-sm mb-2">K.20</label><input type="number" name="ntk20" value={formData.ntk20} onChange={handleChange} className="w-full border rounded-lg p-3 outline-none text-center font-bold" /></div><div className="w-1/2"><label className="block text-sm mb-2">K.50</label><input type="number" name="ntk50" value={formData.ntk50} onChange={handleChange} className="w-full border rounded-lg p-3 outline-none text-center font-bold" /></div></div></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div><label className="block text-sm font-bold text-gray-700 mb-2">Jumlah Top Up (Rp)</label><div className="relative"><span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-500 font-bold text-lg">Rp</span><input type="text" name="topupDisplay" value={formData.topupDisplay} onChange={handleChange} className="w-full border rounded-lg pl-12 p-3 outline-none font-bold text-xl text-green-800" placeholder="0" /></div></div>
                      <div><label className="block text-sm font-bold text-gray-700 mb-2">Keterangan Tambahan</label><input type="text" name="ket" value={formData.ket} onChange={handleChange} className="w-full border rounded-lg p-3 outline-none bg-gray-50" /></div>
                    </div>
                    <div className="flex justify-end pt-6 border-t mt-8">
                      {editingId && <button type="button" onClick={cancelEdit} className="bg-gray-400 text-white font-bold py-3 px-8 rounded-xl mr-4">Batal Edit</button>}
                      <button type="submit" className={`${editingId ? 'bg-blue-600' : 'bg-green-600'} text-white font-bold py-3 px-12 rounded-xl shadow-lg`}>{editingId ? 'Update Cloud' : 'Simpan ke Cloud'}</button>
                    </div>
                  </form>
                </div>
              </div>

              {/* SECTION 2: MONITOR INPUT HARI INI (DIPINDAH KE TENGAH) */}
              <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
                <div className="bg-indigo-50 p-4 border-b flex justify-between items-center"><h3 className="font-bold text-indigo-900 text-lg">Monitor Input Hari Ini ({getActiveSesi()})</h3><div className="text-right"><div className="text-xs text-gray-500 font-semibold">Total Top Up</div><div className="text-xl font-bold text-green-600">Rp {formatRp(livePreviewSums.topup)}</div></div></div>
                <div className="overflow-x-auto p-4 custom-scrollbar">
                  <table className="min-w-full text-xs text-left border rounded"><thead className="bg-gray-100 text-gray-700 font-bold"><tr><th className="p-3 border">Jam</th><th className="p-3 border">Petugas</th><th className="p-3 border">Lokasi</th><th className="p-3 border text-right">Top Up</th><th className="p-3 border text-center text-blue-800">T.K20</th><th className="p-3 border text-center text-blue-800">T.K50</th><th className="p-3 border text-center text-orange-800">NT.K20</th><th className="p-3 border text-center text-orange-800">NT.K50</th><th className="p-3 border text-center">Aksi</th></tr></thead>
                  <tbody className="divide-y">{todaySesiRecords.map(r => (<tr key={r.id} className="hover:bg-gray-50"><td className="p-3 border font-medium">{r.jam_input}</td><td className="p-3 border font-bold">{r.nama}</td><td className="p-3 border">{r.lokasi}</td><td className="p-3 border text-right font-bold text-green-700">{formatRp(r.topup)}</td><td className="p-3 border text-center">{r.tk20}</td><td className="p-3 border text-center">{r.tk50}</td><td className="p-3 border text-center">{r.ntk20}</td><td className="p-3 border text-center">{r.ntk50}</td><td className="p-3 border text-center"><button onClick={() => handleEdit(r)} className="text-blue-600 font-semibold mr-2">Edit</button><button onClick={() => hapusData(r.id)} className="text-red-500 font-semibold">Del</button></td></tr>))}
                  {todaySesiRecords.length === 0 && <tr><td colSpan="9" className="p-8 text-center text-gray-400 italic font-medium">Belum ada input untuk sesi ini.</td></tr>}
                  </tbody></table>
                </div>
              </div>

              {/* SECTION 3: INPUT PENDAPATAN TAMBAHAN (DIPINDAH KE BAWAH) */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden border-t-4 border-purple-500">
                <div className="bg-purple-50 p-4 border-b">
                  <h3 className="font-bold text-purple-900 text-lg flex items-center gap-2">Input Pendapatan Tambahan</h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-50 p-5 rounded-xl border"><h4 className="font-bold text-gray-800 mb-4 border-b pb-2">Pendapatan E-Car</h4><div className="flex gap-4"><div className="flex-1"><label className="block text-xs font-bold mb-2">Total Rp</label><input type="text" name="ecarDisplay" value={extraData.ecarDisplay} onChange={handleExtraChange} className="w-full border rounded-lg p-2.5 font-bold outline-none focus:border-purple-400" placeholder="0" /></div><div className="w-28"><label className="block text-xs font-bold mb-2">TRX</label><input type="number" value={extraData.ecarTrx} readOnly className="w-full border rounded-lg p-2.5 bg-gray-200 text-center font-bold" /></div></div></div>
                  <div className="bg-gray-50 p-5 rounded-xl border"><h4 className="font-bold text-gray-800 mb-4 border-b pb-2">Pendapatan Foto Satwa</h4><div className="flex gap-4"><div className="flex-1"><label className="block text-xs font-bold mb-2">Total Rp</label><input type="text" name="fotoDisplay" value={extraData.fotoDisplay} onChange={handleExtraChange} className="w-full border rounded-lg p-2.5 font-bold outline-none focus:border-purple-400" placeholder="0" /></div><div className="w-28"><label className="block text-xs font-bold mb-2">TRX</label><input type="number" value={extraData.fotoTrx} readOnly className="w-full border rounded-lg p-2.5 bg-gray-200 text-center font-bold" /></div></div></div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: LAPORAN (DIROMBAK URUTANNYA) */}
          {activeTab === 'laporan' && (
            <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 flex flex-col h-full border-t-4 border-indigo-600 max-w-full">
              <h2 className="text-xl font-bold mb-4 border-b pb-2 text-indigo-900">Analisis Data & Detail Transaksi</h2>
              
              {/* 1. FILTER (ATAS) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 mb-6 bg-indigo-50 p-4 rounded-xl border">
                <div><label className="block text-xs font-bold text-indigo-900 mb-1">Dari Tanggal</label><input type="date" value={filter.startDate} onChange={e => setFilter({...filter, startDate: e.target.value})} className="w-full border p-2 rounded-lg outline-none shadow-sm" /></div>
                <div><label className="block text-xs font-bold text-indigo-900 mb-1">Sampai Tanggal</label><input type="date" value={filter.endDate} onChange={e => setFilter({...filter, endDate: e.target.value})} className="w-full border p-2 rounded-lg outline-none shadow-sm" /></div>
                <div><label className="block text-xs font-bold text-indigo-900 mb-1">Sesi</label><select value={filter.sesi} onChange={e => setFilter({...filter, sesi: e.target.value})} className="w-full border p-2 rounded-lg outline-none"><option value="">Semua Sesi</option><option value="Siang">Siang</option><option value="Malam">Malam</option></select></div>
                <div><label className="block text-xs font-bold text-indigo-900 mb-1">Lokasi</label><select value={filter.lokasi} onChange={e => setFilter({...filter, lokasi: e.target.value})} className="w-full border p-2 rounded-lg outline-none"><option value="">Semua Lokasi</option>{lokasiList.map((l, i) => <option key={i} value={l}>{l}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-indigo-900 mb-1">Petugas</label><select value={filter.petugas} onChange={e => setFilter({...filter, petugas: e.target.value})} className="w-full border p-2 rounded-lg outline-none"><option value="">Semua Petugas</option>{petugasList.map((p, i) => <option key={i} value={p}>{p}</option>)}</select></div>
              </div>

              {/* 2. DETAIL TRANSAKSI (TENGAH) */}
              <div className="flex-1 overflow-auto border rounded-xl custom-scrollbar mb-8">
                <table className="min-w-full text-xs md:text-sm text-left"><thead className="bg-indigo-100 text-indigo-900 sticky top-0"><tr>
                  <th className="p-3 cursor-pointer" onClick={() => requestSort('tanggal')}>Tanggal {sortConfig.key === 'tanggal' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                  <th className="p-3 cursor-pointer" onClick={() => requestSort('sesi')}>Sesi {sortConfig.key === 'sesi' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                  <th className="p-3 cursor-pointer" onClick={() => requestSort('nama')}>Petugas {sortConfig.key === 'nama' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                  <th className="p-3">Lokasi</th><th className="p-3 text-right">Top Up</th><th className="p-3 text-center border-l">T.K20</th><th className="p-3 text-center">T.K50</th><th className="p-3 text-center border-l">NT.K20</th><th className="p-3 text-center">NT.K50</th><th className="p-3 text-right font-bold cursor-pointer" onClick={() => requestSort('total')}>Total (Rp) {sortConfig.key === 'total' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                  <th className="p-3 text-center">Ket</th><th className="p-3 text-center">Aksi</th>
                </tr></thead>
                <tbody className="divide-y bg-white">{filteredAndSortedRecords.map(r => (
                  <tr key={r.id} className="hover:bg-indigo-50"><td className="p-3">{r.tanggal}<span className="block text-[10px] text-gray-400">Jam {r.jam_input}</span></td><td className="p-3 font-semibold text-blue-700">{r.sesi}</td><td className="p-3 font-medium">{r.nama}</td><td className="p-3">{r.lokasi}</td><td className="p-3 text-right">{formatRp(r.topup)}</td><td className="p-3 text-center border-l">{r.tk20 || 0}</td><td className="p-3 text-center">{r.tk50 || 0}</td><td className="p-3 text-center border-l">{r.ntk20 || 0}</td><td className="p-3 text-center">{r.ntk50 || 0}</td><td className="p-3 text-right font-bold text-indigo-700">{formatRp(getRowTotal(r))}</td><td className="p-3 italic text-gray-500 text-xs truncate max-w-[150px]">{r.ket}</td><td className="p-3 text-center"><button onClick={() => { setActiveTab('input'); handleEdit(r); }} className="text-blue-500 font-bold mr-2">Edit</button><button onClick={() => hapusData(r.id)} className="text-red-500 font-bold">Del</button></td></tr>
                ))}
                {filteredAndSortedRecords.length === 0 && <tr><td colSpan="12" className="p-12 text-center text-gray-400 font-bold italic text-lg">Tidak ada data untuk filter yang dipilih.</td></tr>}
                </tbody>
                {filteredAndSortedRecords.length > 0 && (
                  <tfoot className="bg-indigo-100 font-bold sticky bottom-0"><tr><td colSpan="4" className="p-4 text-right uppercase tracking-wider text-xs">Total Berdasarkan Filter :</td><td className="p-4 text-right font-black">{formatRp(currentSums.topup)}</td><td className="p-4 text-center border-l">{currentSums.tk20}</td><td className="p-4 text-center">{currentSums.tk50}</td><td className="p-4 text-center border-l">{currentSums.ntk20}</td><td className="p-4 text-center">{currentSums.ntk50}</td><td className="p-4 text-right text-base text-indigo-900">{formatRp(currentSums.total)}</td><td colSpan="2"></td></tr></tfoot>
                )}</table>
              </div>

              {/* 3. REKAPAN KESELURUHAN (BAWAH) */}
              <div className="bg-purple-50 rounded-xl border-2 border-purple-200 p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6 border-b border-purple-200 pb-3">
                  <h3 className="text-xl font-black text-purple-900 uppercase tracking-tighter italic">Rekapitulasi Angka Keseluruhan</h3>
                  <div className="bg-purple-200 text-purple-900 px-4 py-1 rounded-full text-xs font-bold uppercase">{filter.startDate} s/d {filter.endDate}</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border-l-8 border-purple-600">
                    <h4 className="font-black text-purple-800 text-xs uppercase mb-4 tracking-widest">Penjualan Jakcard</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
                         <span className="text-xs font-bold">K.20 <span className="text-[10px] text-gray-400">(T:{currentSums.tk20} | NT:{currentSums.ntk20})</span></span>
                         <span className="font-black text-purple-900">{currentSums.tk20 + currentSums.ntk20} Unit</span>
                      </div>
                      <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
                         <span className="text-xs font-bold">K.50 <span className="text-[10px] text-gray-400">(T:{currentSums.tk50} | NT:{currentSums.ntk50})</span></span>
                         <span className="font-black text-purple-900">{currentSums.tk50 + currentSums.ntk50} Unit</span>
                      </div>
                      <div className="pt-3 border-t-2 border-dashed flex justify-between items-center">
                         <span className="text-xs font-bold uppercase">Nilai Rupiah</span>
                         <span className="font-black text-xl text-purple-700">Rp {formatRp(((currentSums.tk20 + currentSums.ntk20)*45000) + ((currentSums.tk50 + currentSums.ntk50)*75000))}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border-l-8 border-blue-600">
                    <h4 className="font-black text-blue-800 text-xs uppercase mb-4 tracking-widest">Pendapatan E-Car</h4>
                    <div className="flex justify-between items-center mb-4 bg-blue-50 p-3 rounded-xl border border-blue-100">
                       <span className="text-xs font-bold">Total Transaksi (TRX)</span>
                       <span className="font-black text-blue-700 text-2xl">{extraData.ecarTrx}</span>
                    </div>
                    <div className="pt-3 border-t-2 border-dashed flex justify-between items-center">
                       <span className="text-xs font-bold uppercase">Nilai Rupiah</span>
                       <span className="font-black text-xl text-blue-800">Rp {formatRp(extraData.ecarRaw)}</span>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border-l-8 border-orange-600">
                    <h4 className="font-black text-orange-800 text-xs uppercase mb-4 tracking-widest">Pendapatan Foto Satwa</h4>
                    <div className="flex justify-between items-center mb-4 bg-orange-50 p-3 rounded-xl border border-orange-100">
                       <span className="text-xs font-bold">Total Transaksi (TRX)</span>
                       <span className="font-black text-orange-700 text-2xl">{extraData.fotoTrx}</span>
                    </div>
                    <div className="pt-3 border-t-2 border-dashed flex justify-between items-center">
                       <span className="text-xs font-bold uppercase">Nilai Rupiah</span>
                       <span className="font-black text-xl text-orange-800">Rp {formatRp(extraData.fotoRaw)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: CETAK TABEL (HIDDEN IN VIEW) */}
          <div className={activeTab === 'print1' ? 'block print:block max-w-7xl mx-auto' : 'hidden print:hidden'}>
            <div className="mb-4 print:hidden flex flex-col sm:flex-row justify-between items-center bg-blue-50 p-4 rounded-xl border"><div className="flex items-center gap-3"><span className="text-sm font-bold">Pilih Sesi Cetak:</span><select value={filter.sesi} onChange={e => setFilter({...filter, sesi: e.target.value})} className="border rounded-lg p-2 outline-none font-bold"><option value="">Semua Sesi Digabung</option><option value="Siang">Hanya Sesi Siang</option><option value="Malam">Hanya Sesi Malam</option></select></div><button onClick={() => window.print()} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg">Cetak Dokumen</button></div>
            <div className="bg-white p-4 md:p-8 w-full min-h-[297mm] shadow-lg print:shadow-none font-sans text-xs sm:text-sm border"><div className="text-center mb-6 border-b pb-4"><h1 className="font-bold text-lg md:text-xl uppercase">REKAP PENERIMAAN SETORAN PENJUALAN KARTU JAKCARD DAN TOPUP</h1><h2 className="font-bold text-md uppercase">UNIT PENGELOLA TAMAN MARGASATWA RAGUNAN</h2></div><div className="flex justify-between mb-3 font-bold text-sm"><div>Hari/Tanggal : {filter.startDate === filter.endDate ? formatTanggalIndonesia(filter.startDate) : (filter.startDate ? `${filter.startDate} s/d ${filter.endDate}` : 'Semua Tanggal')}</div><div className="uppercase bg-gray-200 px-3 py-1 rounded">Sesi : {filter.sesi ? filter.sesi : 'SIANG & MALAM'}</div></div>
              <table className="w-full border-collapse border border-black mb-4 text-[11px] md:text-xs"><thead className="bg-gray-200 text-center font-bold"><tr><th className="border border-black p-2" rowSpan="2">NO</th><th className="border border-black p-2" rowSpan="2">Nama</th><th className="border border-black p-2" rowSpan="2">Lokasi</th><th className="border border-black p-2" rowSpan="2">Jumlah TOP UP (Rp)</th><th className="border border-black p-2" colSpan="2">Tunai</th><th className="border border-black p-2" colSpan="2">Non Tunai</th><th className="border border-black p-2" rowSpan="2">Jumlah (Rp)</th><th className="border border-black p-2" rowSpan="2">KET</th></tr><tr><th className="border border-black p-1">K. 20</th><th className="border border-black p-1">K. 50</th><th className="border border-black p-1">K. 20</th><th className="border border-black p-1">K. 50</th></tr></thead>
              <tbody>{filteredAndSortedRecords.map((r, i) => (<tr key={r.id} className="even:bg-gray-50"><td className="border border-black p-2 text-center">{i + 1}</td><td className="border border-black p-2">{r.nama}</td><td className="border border-black p-2">{r.lokasi}</td><td className="border border-black p-2 text-right">{formatRp(r.topup)}</td><td className="border border-black p-2 text-center">{r.tk20 || 0}</td><td className="border border-black p-2 text-center">{r.tk50 || 0}</td><td className="border border-black p-2 text-center">{r.ntk20 || 0}</td><td className="border border-black p-2 text-center">{r.ntk50 || 0}</td><td className="border border-black p-2 text-right font-bold">{formatRp(getRowTotal(r))}</td><td className="border border-black p-1 text-center italic text-gray-700">{r.ket}</td></tr>))}
              <tr className="bg-gray-300 font-bold"><td className="border border-black p-2 text-center" colSpan="3">JUMLAH</td><td className="border border-black p-2 text-right">{formatRp(currentSums.topup)}</td><td className="border border-black p-2 text-center">{currentSums.tk20}</td><td className="border border-black p-2 text-center">{currentSums.tk50}</td><td className="border border-black p-2 text-center">{currentSums.ntk20}</td><td className="border border-black p-2 text-center">{currentSums.ntk50}</td><td className="border border-black p-2 text-right">{formatRp(currentSums.total)}</td><td className="border border-black"></td></tr></tbody></table>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
