// @ts-nocheck
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, setDoc } from 'firebase/firestore';

// ==========================================
// KONFIGURASI FIREBASE
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
  // Inject Font & Base Styles
  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }
    if (!document.getElementById('inter-font')) {
      const link = document.createElement('link');
      link.id = 'inter-font';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  // Helpers Tanggal & Terbilang
  const getTodayStr = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return (new Date(d.getTime() - offset)).toISOString().split('T')[0];
  };

  const parseLocalDate = (dateString) => {
    if(!dateString) return new Date();
    const [y, m, d] = dateString.split('-');
    return new Date(y, m - 1, d);
  };

  const formatTanggalStandard = (dateString) => {
    if(!dateString) return '';
    const date = parseLocalDate(dateString);
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    const dd = String(date.getDate()).padStart(2, '0');
    return `${dd}-${bulan[date.getMonth()]}-${date.getFullYear()}`;
  };

  const formatTanggalHari = (dateString) => {
    if(!dateString) return '';
    const date = parseLocalDate(dateString);
    const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return `${hari[date.getDay()]}, ${formatTanggalStandard(dateString)}`;
  };

  const getDateParts = (dateString) => {
    if(!dateString) return { hari: '', tgl: '', bln: '', thn: '' };
    const d = parseLocalDate(dateString);
    const hariArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const blnArr = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return {
      hari: hariArr[d.getDay()], tgl: String(d.getDate()).padStart(2, '0'),
      bln: blnArr[d.getMonth()], thn: d.getFullYear()
    };
  };

  const terbilang = (angka) => {
    angka = Math.abs(angka);
    const bilangan = ['','Satu','Dua','Tiga','Empat','Lima','Enam','Tujuh','Delapan','Sembilan','Sepuluh','Sebelas'];
    let result = '';
    if (angka < 12) result = bilangan[angka];
    else if (angka < 20) result = terbilang(angka - 10) + ' Belas';
    else if (angka < 100) result = terbilang(Math.floor(angka / 10)) + ' Puluh ' + terbilang(angka % 10);
    else if (angka < 200) result = 'Seratus ' + terbilang(angka - 100);
    else if (angka < 1000) result = terbilang(Math.floor(angka / 100)) + ' Ratus ' + terbilang(angka % 100);
    else if (angka < 2000) result = 'Seribu ' + terbilang(angka - 1000);
    else if (angka < 1000000) result = terbilang(Math.floor(angka / 1000)) + ' Ribu ' + terbilang(angka % 1000);
    else if (angka < 1000000000) result = terbilang(Math.floor(angka / 1000000)) + ' Juta ' + terbilang(angka % 1000000);
    return result.trim();
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('input');
  const [reportType, setReportType] = useState('umum'); 
  
  const [user, setUser] = useState(null);
  const [isLoadingDB, setIsLoadingDB] = useState(true);

  const [petugasList, setPetugasList] = useState([]);
  const [lokasiList, setLokasiList] = useState([]);
  const [penandatangan, setPenandatangan] = useState({ bendahara: '', pemeriksa: '' });

  // State utama FormData, ditambah topupDetails untuk menyimpan rincian EDC
  const [formData, setFormData] = useState({
    tanggal: getTodayStr(),
    nama: '', lokasi: '', topupDisplay: '', topupRaw: 0, topupDetails: [], 
    tk20: '', tk50: '', ntk20: '', ntk50: '', ket: ''
  });

  // Logika jam: Jika di atas jam 20:00 (Malam), selain itu Siang.
  const getActiveSesi = () => new Date().getHours() >= 20 ? 'Malam' : 'Siang';
  const activeSesi = getActiveSesi();

  // State sementara untuk kalkulator EDC
  const [tempEdc, setTempEdc] = useState('');
  const edcInputRef = useRef(null);

  const [editingId, setEditingId] = useState(null);
  const [extraInputData, setExtraInputData] = useState({ ecarDisplay: '', ecarRaw: 0, ecarTrx: 0, fotoDisplay: '', fotoRaw: 0, fotoTrx: 0 });

  const [filter, setFilter] = useState({ 
    startDate: getTodayStr(), 
    endDate: getTodayStr(), 
    sesi: '', lokasi: '', petugas: '' 
  });
  const [sortConfig, setSortConfig] = useState({ key: 'tanggal', direction: 'desc' });
  const [monitorSortDir, setMonitorSortDir] = useState('desc');
  
  // State khusus untuk cetak bukti setor
  const [selectedRecordForPrint, setSelectedRecordForPrint] = useState(null);

  const [records, setRecords] = useState([]);
  const [extraRecords, setExtraRecords] = useState([]);

  useEffect(() => {
    const initAuth = async () => {
      if (!auth) { setIsLoadingDB(false); return; }
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { console.error("Auth Error:", err); setIsLoadingDB(false); }
    };
    initAuth();

    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => { setUser(u); setIsLoadingDB(false); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    const masterDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'master');
    const unsubMaster = onSnapshot(masterDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.petugas) setPetugasList([...data.petugas].sort((a, b) => a.localeCompare(b)));
        if (data.lokasi) setLokasiList([...data.lokasi].sort((a, b) => a.localeCompare(b)));
        if (data.penandatangan) setPenandatangan(data.penandatangan);
      } else {
        setDoc(masterDocRef, {
          petugas: [
            'Agung Puji Saputra', 'Ahmad Maulana', 'Ahmad Rivaldi', 'Aldi Priadi Ekapaksi', 
            'Alfatah', 'Amanda Luthfia Ramadhani', 'Amanda Sabila', 'Arif Nurdiansah', 
            'Eka Priyantiningsih', 'Erfan', 'Ernawati Yuliastiningsih', 'Ervi Irawati', 
            'Febry', 'Feiruz', 'Fildzah Shabrina', 'Firda Anjanie', 'Herdi Nofiandi', 
            'Ilham Setiyono', 'Irma Khotimah', 'Laska Nur Shadrina', 'M. Zahwa Dwianka', 
            'Moh Izwan Ikhsani', 'Nabila Noor Main', 'Ningrum Septianti', 'Novia Istiqomah', 
            'Nuzul Khaerun Ramadhan', 'Ravi Aditya Fadillah', 'Rendy Renaldhy', 
            'Ridwan Maulana', 'Rizki Eriansyah', 'Rizmy Hikmat', 'Rosa Anjulina', 
            'Ryant Sena Perwira', 'Sahara Firyal Humaira', 'Sarifudin', 'Siska Rahmawati', 
            'Uci Anggraini', 'Widyo Siswantoro', 'Yusuf Syafiih'
          ].sort((a, b) => a.localeCompare(b)),
          lokasi: ['Barat Kendaraan', 'Motor Utara', 'TOL UTARA'].sort((a, b) => a.localeCompare(b)),
          penandatangan: { bendahara: 'Evi Irmawati', pemeriksa: 'Hermawati' }
        }).catch(err => console.log("Gagal inisiasi Master DB", err));
      }
    });

    const recordsRef = collection(db, 'artifacts', appId, 'public', 'data', 'records');
    const unsubRecords = onSnapshot(recordsRef, (snapshot) => {
      const recs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecords(recs);
    });

    const extraColRef = collection(db, 'artifacts', appId, 'public', 'data', 'daily_extra');
    const unsubExtraCol = onSnapshot(extraColRef, (snapshot) => {
      const recs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setExtraRecords(recs);
    });

    return () => { unsubMaster(); unsubRecords(); unsubExtraCol(); };
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    const docIdExtra = `${formData.tanggal}_${activeSesi}`;
    const extraInputRef = doc(db, 'artifacts', appId, 'public', 'data', 'daily_extra', docIdExtra);
    const unsubExtraInput = onSnapshot(extraInputRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setExtraInputData({
          ecarRaw: data.ecarRaw || 0, ecarTrx: data.ecarTrx || 0,
          ecarDisplay: data.ecarRaw ? new Intl.NumberFormat('id-ID').format(data.ecarRaw) : '',
          fotoRaw: data.fotoRaw || 0, fotoTrx: data.fotoTrx || 0,
          fotoDisplay: data.fotoRaw ? new Intl.NumberFormat('id-ID').format(data.fotoRaw) : ''
        });
      } else {
        setExtraInputData({ ecarDisplay: '', ecarRaw: 0, ecarTrx: 0, fotoDisplay: '', fotoRaw: 0, fotoTrx: 0 });
      }
    });
    return () => unsubExtraInput();
  }, [user, formData.tanggal, activeSesi]);

  const HARGA_K20 = 45000;
  const HARGA_K50 = 75000;
  const formatRp = (angka) => new Intl.NumberFormat('id-ID').format(angka || 0);
  const getRowTotal = (row) => (row.topup || 0) + ((row.tk20 || 0) * HARGA_K20) + ((row.tk50 || 0) * HARGA_K50);
  
  const updateMasterDB = async (payload) => {
    if (!user) return;
    try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'master'), payload, { merge: true }); } 
    catch (error) { alert("⚠️ GAGAL MENYIMPAN KE DATABASE!"); }
  };

  const [newPetugas, setNewPetugas] = useState('');
  const [newLokasi, setNewLokasi] = useState('');
  const [editLokasiIdx, setEditLokasiIdx] = useState(null);
  const [editLokasiValue, setEditLokasiValue] = useState('');
  const [editPetugasIdx, setEditPetugasIdx] = useState(null);
  const [editPetugasValue, setEditPetugasValue] = useState('');

  const addPetugas = () => { if(newPetugas) { updateMasterDB({ petugas: [...petugasList, newPetugas].sort((a, b) => a.localeCompare(b)) }); setNewPetugas(''); }};
  const addLokasi = () => { if(newLokasi) { updateMasterDB({ lokasi: [...lokasiList, newLokasi].sort((a, b) => a.localeCompare(b)) }); setNewLokasi(''); }};
  const delPetugas = (idx) => updateMasterDB({ petugas: petugasList.filter((_, i) => i !== idx) });
  const delLokasi = (idx) => updateMasterDB({ lokasi: lokasiList.filter((_, i) => i !== idx) });

  const startEditLokasi = (idx) => { setEditLokasiIdx(idx); setEditLokasiValue(lokasiList[idx]); };
  const saveEditLokasi = (idx) => { const newList = [...lokasiList]; newList[idx] = editLokasiValue; updateMasterDB({ lokasi: newList }); setEditLokasiIdx(null); };
  const startEditPetugas = (idx) => { setEditPetugasIdx(idx); setEditPetugasValue(petugasList[idx]); };
  const saveEditPetugas = (idx) => { const newList = [...petugasList]; newList[idx] = editPetugasValue; updateMasterDB({ petugas: newList }); setEditPetugasIdx(null); };

  const handleEdit = (record) => {
    setFormData({
      tanggal: record.tanggal, nama: record.nama, lokasi: record.lokasi,
      topupDisplay: record.topup ? formatRp(record.topup) : '', topupRaw: record.topup || 0,
      topupDetails: record.topup_details || [], 
      tk20: record.tk20 || '', tk50: record.tk50 || '', ntk20: record.ntk20 || '', ntk50: record.ntk50 || '', ket: record.ket || ''
    });
    setEditingId(record.id);
    setActiveTab('input');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData(prev => ({ ...prev, nama: '', lokasi: '', topupDisplay: '', topupRaw: 0, topupDetails: [], tk20: '', tk50: '', ntk20: '', ntk50: '', ket: '' }));
  };

  // FUNGSI UNTUK KALKULATOR MINI EDC
  const handleAddEdc = () => {
    const val = Number(tempEdc.replace(/\D/g, ''));
    if (val > 0) {
      const newDetails = [...formData.topupDetails, val];
      const newTotal = newDetails.reduce((a, b) => a + b, 0);
      setFormData(prev => ({ ...prev, topupDetails: newDetails, topupRaw: newTotal, topupDisplay: formatRp(newTotal) }));
      setTempEdc(''); 
      
      // Auto-focus kembali ke input EDC
      setTimeout(() => {
        if (edcInputRef.current) edcInputRef.current.focus();
      }, 0);
    }
  };

  const handleRemoveEdc = (index) => {
    const newDetails = formData.topupDetails.filter((_, i) => i !== index);
    const newTotal = newDetails.reduce((a, b) => a + b, 0);
    setFormData(prev => ({ ...prev, topupDetails: newDetails, topupRaw: newTotal, topupDisplay: newTotal ? formatRp(newTotal) : '' }));
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
      
      const docIdExtra = `${formData.tanggal}_${activeSesi}`;

      try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'daily_extra', docIdExtra), {
          [rawKey]: rawNumber, [trxKey]: trxValue,
          tanggal: formData.tanggal,
          sesi: activeSesi
        }, { merge: true });
      } catch (error) { console.error("Gagal simpan Ecar/Foto:", error); }
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'topupDisplay') {
      const rawValue = value.replace(/\D/g, '');
      const rawNumber = Number(rawValue);
      const resetDetails = formData.topupDetails.length > 0 ? [] : formData.topupDetails;
      setFormData(prev => ({ ...prev, topupDisplay: rawValue ? formatRp(rawNumber) : '', topupRaw: rawNumber, topupDetails: resetDetails }));
    } else { 
      setFormData(prev => ({ ...prev, [name]: value })); 
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    const payload = {
      tanggal: formData.tanggal, nama: formData.nama, lokasi: formData.lokasi,
      topup: formData.topupRaw, topup_details: formData.topupDetails, ket: formData.ket,
      tk20: Number(formData.tk20) || 0, tk50: Number(formData.tk50) || 0,
      ntk20: Number(formData.ntk20) || 0, ntk50: Number(formData.ntk50) || 0,
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'records', editingId), payload);
        setEditingId(null);
      } else {
        const now = new Date();
        payload.jam_input = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        payload.sesi = activeSesi;
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'records'), payload);
      }
      setFormData(prev => ({ ...prev, nama: '', lokasi: '', topupDisplay: '', topupRaw: 0, topupDetails: [], tk20: '', tk50: '', ntk20: '', ntk50: '', ket: '' }));
      alert("✅ Data berhasil disimpan dengan aman!");
    } catch (error) { alert("⚠️ GAGAL MENYIMPAN KE CLOUD!"); }
  };
  
  const hapusData = async (id) => { 
    if (!user) return;
    if(window.confirm('Hapus permanen data ini dari cloud?')) {
      try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'records', id)); } 
      catch (error) { alert("⚠️ Gagal menghapus!"); }
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

  const filteredExtraRecords = useMemo(() => {
    let result = [...extraRecords];
    if (filter.startDate) result = result.filter(r => (r.tanggal || r.id.split('_')[0]) >= filter.startDate);
    if (filter.endDate) result = result.filter(r => (r.tanggal || r.id.split('_')[0]) <= filter.endDate);
    if (filter.sesi) result = result.filter(r => (r.sesi || 'Siang') === filter.sesi);
    
    result.sort((a, b) => {
      const dateA = a.tanggal || a.id.split('_')[0];
      const dateB = b.tanggal || b.id.split('_')[0];
      return dateB.localeCompare(dateA); 
    }); 
    return result;
  }, [extraRecords, filter.startDate, filter.endDate, filter.sesi]);

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
  
  const todaySesiRecords = useMemo(() => {
    let filtered = records.filter(r => r.tanggal === formData.tanggal && r.sesi === activeSesi);
    filtered.sort((a, b) => {
      const timeA = a.jam_input || '';
      const timeB = b.jam_input || '';
      if (timeA < timeB) return monitorSortDir === 'asc' ? -1 : 1;
      if (timeA > timeB) return monitorSortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return filtered;
  }, [records, formData.tanggal, activeSesi, monitorSortDir]);
  
  const livePreviewSums = calculateSums(todaySesiRecords);

  const extraSums = useMemo(() => {
    return filteredExtraRecords.reduce((acc, curr) => ({
      ecarRaw: acc.ecarRaw + (curr.ecarRaw || 0), ecarTrx: acc.ecarTrx + (curr.ecarTrx || 0),
      fotoRaw: acc.fotoRaw + (curr.fotoRaw || 0), fotoTrx: acc.fotoTrx + (curr.fotoTrx || 0),
    }), { ecarRaw: 0, ecarTrx: 0, fotoRaw: 0, fotoTrx: 0 });
  }, [filteredExtraRecords]);

  const reportData = {
    kartu20Rp: currentSums.tk20 * 25000, kartu50Rp: currentSums.tk50 * 25000,
    saldo20Rp: currentSums.tk20 * 20000, saldo50Rp: currentSums.tk50 * 50000,
  };
  const totalKartu = reportData.kartu20Rp + reportData.kartu50Rp;
  const totalSaldo = reportData.saldo20Rp + reportData.saldo50Rp;
  const totalPenjualanJakcard = totalKartu + totalSaldo;
  const grandTotal = totalPenjualanJakcard + currentSums.topup;
  
  if (isLoadingDB) return (
    <div className="flex flex-col h-screen items-center justify-center bg-slate-50 text-emerald-800 font-semibold text-lg animate-pulse" style={{ fontFamily: "'Inter', sans-serif" }}>
      <svg className="w-10 h-10 mb-3 text-emerald-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
      Menyinkronkan dengan Cloud TMR...
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 overflow-hidden relative" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} print:hidden shadow-2xl`}>
        <div className="p-5 flex justify-between items-center border-b border-slate-800 bg-slate-950">
          <h1 className="text-lg font-bold tracking-wide text-emerald-400">REKAP TOP-UP DAN JAKCARD</h1>
          <button onClick={() => setIsSidebarOpen(false)} className="text-slate-400 hover:text-white focus:outline-none transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <nav className="p-4 space-y-1.5 text-sm font-medium overflow-y-auto h-[calc(100vh-80px)] custom-scrollbar">
          <div className="text-slate-500 uppercase text-[10px] font-bold tracking-widest mb-2 mt-4 px-3">Modul Operasional</div>
          <button onClick={() => { setActiveTab('input'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${activeTab === 'input' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg> Input Setoran
          </button>
          
          <div className="text-slate-500 uppercase text-[10px] font-bold tracking-widest mb-2 mt-6 px-3">Modul Cetak Dokumen</div>
          <button onClick={() => { setActiveTab('print3'); setSelectedRecordForPrint(null); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${activeTab === 'print3' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Cetak Bukti Setor
          </button>
          <button onClick={() => { setActiveTab('print1'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${activeTab === 'print1' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg> Cetak Tabel Harian
          </button>
          <button onClick={() => { setActiveTab('print2'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${activeTab === 'print2' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Cetak Rekapitulasi
          </button>

          <div className="text-slate-500 uppercase text-[10px] font-bold tracking-widest mb-2 mt-6 px-3">Sistem & Database</div>
          <button onClick={() => { setActiveTab('laporan'); setReportType('umum'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${activeTab === 'laporan' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg> Analitik & Laporan
          </button>
          <button onClick={() => { setActiveTab('master'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${activeTab === 'master' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg> Master Data Sistem
          </button>
        </nav>
      </aside>

      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900 bg-opacity-60 z-40 print:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)}></div>}

      <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
        {/* HEADER ATAS */}
        <header className="bg-white shadow-sm print:hidden flex items-center px-6 py-4 border-b border-slate-200 z-10">
          <button onClick={() => setIsSidebarOpen(true)} className="mr-4 text-slate-500 hover:text-emerald-600 focus:outline-none transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>
          
          <div className="flex justify-between items-center w-full">
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">
              {activeTab === 'input' && 'Input Transaksi Harian'}
              {activeTab === 'master' && 'Konfigurasi Master Data'}
              {activeTab === 'print1' && 'Pencetakan Tabel Harian'}
              {activeTab === 'print2' && 'Pencetakan Rekapitulasi'}
              {activeTab === 'print3' && 'Pencetakan Bukti Setor'}
              {activeTab === 'laporan' && 'Laporan & Analitik Terpadu'}
            </h2>
            <div className="hidden sm:flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
               <span className="relative flex h-2.5 w-2.5"><span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${user ? 'bg-emerald-400' : 'bg-amber-400'}`}></span><span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${user ? 'bg-emerald-500' : 'bg-amber-500'}`}></span></span>
               <span className={`text-xs font-semibold tracking-wide ${user ? 'text-emerald-700' : 'text-amber-700'}`}>
                 {user ? 'Cloud Aktif' : 'Mode Offline'}
               </span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8 bg-slate-50/50 print:p-0 print:bg-white print:overflow-visible custom-scrollbar">
          
          {/* TAB: DATA MASTER */}
          {activeTab === 'master' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-base text-slate-800 mb-4 border-b border-slate-100 pb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                  Pejabat Pengesah
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Bendahara Penerima</label>
                    <input type="text" value={penandatangan.bendahara} onChange={e => { const v = e.target.value; setPenandatangan({...penandatangan, bendahara: v}); updateMasterDB({ penandatangan: {...penandatangan, bendahara: v} }); }} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm font-medium text-slate-800" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Petugas Pemeriksa</label>
                    <input type="text" value={penandatangan.pemeriksa} onChange={e => { const v = e.target.value; setPenandatangan({...penandatangan, pemeriksa: v}); updateMasterDB({ penandatangan: {...penandatangan, pemeriksa: v} }); }} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm font-medium text-slate-800" />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-base text-slate-800 mb-4 border-b border-slate-100 pb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                  Daftar Lokasi/Loket
                </h3>
                <div className="flex gap-2 mb-4">
                  <input type="text" value={newLokasi} onChange={e => setNewLokasi(e.target.value)} placeholder="Ketik lokasi baru..." className="flex-1 border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium" />
                  <button onClick={addLokasi} className="bg-blue-600 text-white px-4 rounded-lg hover:bg-blue-700 font-bold transition-colors">+</button>
                </div>
                <ul className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {lokasiList.map((lok, i) => (
                    <li key={i} className="flex justify-between items-center bg-slate-50 p-2.5 border border-slate-100 rounded-lg group hover:border-slate-300 transition-colors">
                      {editLokasiIdx === i ? (
                        <input type="text" value={editLokasiValue} onChange={(e) => setEditLokasiValue(e.target.value)} className="flex-1 border border-blue-400 p-1 mr-2 rounded outline-none text-sm font-medium" autoFocus />
                      ) : ( <span className="text-sm font-medium text-slate-700">{lok}</span> )}
                      <div className="flex gap-1 ml-2 opacity-50 group-hover:opacity-100 transition-opacity">
                        {editLokasiIdx === i ? (
                          <>
                            <button onClick={() => saveEditLokasi(i)} className="text-emerald-600 font-semibold text-xs px-2 py-1 hover:bg-emerald-50 rounded">OK</button>
                            <button onClick={() => setEditLokasiIdx(null)} className="text-slate-500 font-semibold text-xs px-2 py-1 hover:bg-slate-200 rounded">X</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEditLokasi(i)} className="text-blue-600 font-medium text-xs px-2 py-1 hover:bg-blue-50 rounded">Edit</button>
                            <button onClick={() => delLokasi(i)} className="text-red-500 font-medium text-xs px-2 py-1 hover:bg-red-50 rounded">Hapus</button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-base text-slate-800 mb-4 border-b border-slate-100 pb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                  Daftar Petugas
                </h3>
                <div className="flex gap-2 mb-4">
                  <input type="text" value={newPetugas} onChange={e => setNewPetugas(e.target.value)} placeholder="Ketik nama petugas..." className="flex-1 border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-orange-500 text-sm font-medium" />
                  <button onClick={addPetugas} className="bg-orange-500 text-white px-4 rounded-lg hover:bg-orange-600 font-bold transition-colors">+</button>
                </div>
                <ul className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {petugasList.map((pet, i) => (
                    <li key={i} className="flex justify-between items-center bg-slate-50 p-2.5 border border-slate-100 rounded-lg group hover:border-slate-300 transition-colors">
                      {editPetugasIdx === i ? (
                        <input type="text" value={editPetugasValue} onChange={(e) => setEditPetugasValue(e.target.value)} className="flex-1 border border-orange-400 p-1 mr-2 rounded outline-none text-sm font-medium" autoFocus />
                      ) : ( <span className="text-sm font-medium text-slate-700">{pet}</span> )}
                      <div className="flex gap-1 ml-2 opacity-50 group-hover:opacity-100 transition-opacity">
                        {editPetugasIdx === i ? (
                          <>
                            <button onClick={() => saveEditPetugas(i)} className="text-emerald-600 font-semibold text-xs px-2 py-1 hover:bg-emerald-50 rounded">OK</button>
                            <button onClick={() => setEditPetugasIdx(null)} className="text-slate-500 font-semibold text-xs px-2 py-1 hover:bg-slate-200 rounded">X</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEditPetugas(i)} className="text-orange-600 font-medium text-xs px-2 py-1 hover:bg-orange-50 rounded">Edit</button>
                            <button onClick={() => delPetugas(i)} className="text-red-500 font-medium text-xs px-2 py-1 hover:bg-red-50 rounded">Hapus</button>
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
            <div className="max-w-6xl mx-auto space-y-8">
              
              {/* SECTION 1: FORM UTAMA */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    Formulir Setoran Jakcard & Topup
                  </h3>
                </div>
                <div className="p-6 md:p-8">
                  <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Baris 1: Info Dasar */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <div className="flex justify-between items-end mb-2">
                          <label className="block text-sm font-semibold text-slate-700">Tanggal Transaksi</label>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-emerald-200 shadow-sm">
                            {formatTanggalHari(formData.tanggal)}
                          </span>
                        </div>
                        <input type="date" name="tanggal" value={formData.tanggal} max={getTodayStr()} onChange={handleChange} required className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50/50 font-semibold text-slate-800 cursor-pointer transition-all" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Nama Petugas</label>
                        <select name="nama" value={formData.nama} onChange={handleChange} required className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-medium text-slate-800 bg-white transition-all">
                          <option value="">-- Pilih Petugas --</option>{petugasList.map((p, i) => <option key={i} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Lokasi Penjualan</label>
                        <select name="lokasi" value={formData.lokasi} onChange={handleChange} required className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-medium text-slate-800 bg-white transition-all">
                          <option value="">-- Pilih Lokasi --</option>{lokasiList.map((l, i) => <option key={i} value={l}>{l}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Baris 2: Kartu */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
                        <h3 className="text-sm font-bold text-blue-900 mb-4 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Pembayaran Tunai (Pcs)</h3>
                        <div className="flex gap-4">
                          <div className="w-1/2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Kartu 20K</label>
                            <input type="number" name="tk20" value={formData.tk20} onChange={handleChange} className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center font-bold text-slate-800 transition-all" placeholder="0" />
                            <div className="text-center mt-1.5 text-[11px] font-bold text-blue-600/80">Rp {formatRp((Number(formData.tk20) || 0) * HARGA_K20)}</div>
                          </div>
                          <div className="w-1/2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Kartu 50K</label>
                            <input type="number" name="tk50" value={formData.tk50} onChange={handleChange} className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center font-bold text-slate-800 transition-all" placeholder="0" />
                            <div className="text-center mt-1.5 text-[11px] font-bold text-blue-600/80">Rp {formatRp((Number(formData.tk50) || 0) * HARGA_K50)}</div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-orange-50/50 p-6 rounded-2xl border border-orange-100">
                        <h3 className="text-sm font-bold text-orange-900 mb-4 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500"></div> Pembayaran Non-Tunai (Pcs)</h3>
                        <div className="flex gap-4">
                          <div className="w-1/2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Kartu 20K</label>
                            <input type="number" name="ntk20" value={formData.ntk20} onChange={handleChange} className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-center font-bold text-slate-800 transition-all" placeholder="0" />
                            <div className="text-center mt-1.5 text-[11px] font-bold text-orange-600/80">Rp {formatRp((Number(formData.ntk20) || 0) * HARGA_K20)}</div>
                          </div>
                          <div className="w-1/2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Kartu 50K</label>
                            <input type="number" name="ntk50" value={formData.ntk50} onChange={handleChange} className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-center font-bold text-slate-800 transition-all" placeholder="0" />
                            <div className="text-center mt-1.5 text-[11px] font-bold text-orange-600/80">Rp {formatRp((Number(formData.ntk50) || 0) * HARGA_K50)}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Baris 3: Topup & Ket (DENGAN KALKULATOR EDC) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Total Nominal Top Up (Rp)</label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400 font-bold">Rp</span>
                            <input type="text" name="topupDisplay" value={formData.topupDisplay} onChange={handleChange} className="w-full border border-slate-300 rounded-xl pl-12 p-3 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-bold text-lg text-slate-800 transition-all bg-white" placeholder="0" />
                          </div>
                        </div>

                        {/* Kalkulator EDC Mini */}
                        <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-100">
                           <div className="flex justify-between items-center mb-2">
                             <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest flex items-center gap-1.5"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg> Kalkulator Settlement EDC</span>
                             <span className="text-[9px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded font-semibold border border-emerald-200">Opsional</span>
                           </div>
                           <div className="flex gap-2">
                             <input type="text" ref={edcInputRef} value={tempEdc} onChange={e => {
                                const val = e.target.value.replace(/\D/g, '');
                                setTempEdc(val ? formatRp(Number(val)) : '');
                             }} placeholder="Ketik nominal struk EDC..." className="flex-1 border border-emerald-200 rounded-lg p-2.5 outline-none focus:border-emerald-500 text-sm font-semibold bg-white" 
                             onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddEdc(); } }} />
                             <button type="button" onClick={handleAddEdc} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition shadow-sm">+ Tambah</button>
                           </div>
                           
                           {/* List Rincian yang sudah ditambah */}
                           {formData.topupDetails && formData.topupDetails.length > 0 && (
                             <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-emerald-200/60">
                               {formData.topupDetails.map((nominal, idx) => (
                                 <div key={idx} className="bg-white border border-emerald-200 text-emerald-700 text-[11px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-2 shadow-sm">
                                   Rp {formatRp(nominal)}
                                   <button type="button" onClick={() => handleRemoveEdc(idx)} className="text-red-400 hover:text-red-600 font-black text-sm">&times;</button>
                                 </div>
                               ))}
                             </div>
                           )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Keterangan (Opsional)</label>
                        <textarea rows="4" name="ket" value={formData.ket} onChange={handleChange} className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-medium text-slate-700 transition-all resize-none" placeholder="Misal: Mesin EDC Error" />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-center pt-6 border-t border-slate-200 mt-8 gap-4">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 w-full sm:w-auto flex items-center justify-between sm:justify-start gap-6 shadow-sm">
                        <div>
                           <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Total Setoran Tunai</div>
                           <div className="text-[10px] text-slate-400 font-medium">Kartu Tunai: <span className="font-semibold text-slate-600">Rp {formatRp(((Number(formData.tk20) || 0) * HARGA_K20) + ((Number(formData.tk50) || 0) * HARGA_K50))}</span></div>
                        </div>
                        <div className="text-xl font-black text-slate-800">
                           Rp {formatRp(((Number(formData.tk20) || 0) * HARGA_K20) + ((Number(formData.tk50) || 0) * HARGA_K50) + (Number(formData.topupRaw) || 0))}
                        </div>
                      </div>
                      <div className="flex gap-4 w-full sm:w-auto">
                        {editingId && <button type="button" onClick={cancelEdit} className="flex-1 sm:flex-none bg-white border border-slate-300 text-slate-700 font-semibold py-3 px-8 rounded-xl hover:bg-slate-50 transition-all">Batal Edit</button>}
                        <button type="submit" className={`flex-1 sm:flex-none ${editingId ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/30'} text-white font-bold py-3 px-10 rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5`}>
                          {editingId ? 'Update Data Transaksi' : 'Simpan Transaksi Jakcard'}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>

              {/* SECTION 2: MONITOR TRANSAKSI */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 p-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">Monitor Transaksi Sesi {activeSesi}</h3>
                    <p className="text-xs font-medium text-slate-500 mt-1">
                      Data tercatat untuk tanggal: <span className="font-bold text-emerald-600">{formatTanggalStandard(formData.tanggal)}</span>
                    </p>
                  </div>
                  <div className="text-right bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Total Top Up Terkumpul</div>
                    <div className="text-lg font-black text-emerald-600 leading-tight">Rp {formatRp(livePreviewSums.topup)}</div>
                  </div>
                </div>
                <div className="overflow-x-auto p-0">
                  <table className="min-w-full text-sm text-left"><thead className="bg-slate-50/80 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="p-4 cursor-pointer hover:bg-slate-200/50 transition-colors" rowSpan="2" onClick={() => setMonitorSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}>
                        Waktu {monitorSortDir === 'asc' ? '↑' : '↓'}
                      </th>
                      <th className="p-4" rowSpan="2">Petugas</th>
                      <th className="p-4" rowSpan="2">Lokasi</th>
                      <th className="p-4 text-right" rowSpan="2">Top Up (Rp)</th>
                      <th className="p-2 text-center border-l border-slate-200" colSpan="2">Tunai (Pcs)</th>
                      <th className="p-2 text-center border-l border-slate-200" colSpan="2">Non-Tunai (Pcs)</th>
                      <th className="p-4 text-right border-l border-slate-200" rowSpan="2">Total (Rp)</th>
                      <th className="p-4 text-center border-l border-slate-200" rowSpan="2">Aksi</th>
                    </tr>
                    <tr className="border-t border-slate-200">
                      <th className="p-2 text-center border-l border-slate-200 text-[9px] text-blue-600">K.20</th>
                      <th className="p-2 text-center text-[9px] text-blue-600">K.50</th>
                      <th className="p-2 text-center border-l border-slate-200 text-[9px] text-orange-600">K.20</th>
                      <th className="p-2 text-center text-[9px] text-orange-600">K.50</th>
                    </tr>
                    </thead>
                  <tbody className="divide-y divide-slate-100">{todaySesiRecords.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-medium text-slate-500 text-xs whitespace-nowrap">{r.jam_input} WIB</td>
                      <td className="p-4 font-semibold text-slate-800">{r.nama}</td>
                      <td className="p-4 text-slate-600">{r.lokasi}</td>
                      <td className="p-4 text-right font-bold text-emerald-600">
                         {formatRp(r.topup)}
                         {r.topup_details && r.topup_details.length > 0 && (
                            <div className="text-[9px] text-slate-400 font-semibold mt-1">({r.topup_details.length} struk)</div>
                         )}
                      </td>
                      <td className="p-4 text-center border-l border-slate-100">
                        <div className="font-bold text-blue-600 text-xs">{r.tk20 || 0}</div>
                        {r.tk20 > 0 && <div className="text-[9px] text-slate-400 font-medium mt-0.5">Rp {formatRp(r.tk20 * HARGA_K20)}</div>}
                      </td>
                      <td className="p-4 text-center">
                        <div className="font-bold text-blue-600 text-xs">{r.tk50 || 0}</div>
                        {r.tk50 > 0 && <div className="text-[9px] text-slate-400 font-medium mt-0.5">Rp {formatRp(r.tk50 * HARGA_K50)}</div>}
                      </td>
                      <td className="p-4 text-center font-bold text-orange-600 text-xs border-l border-slate-100">{r.ntk20 || 0}</td>
                      <td className="p-4 text-center font-bold text-orange-600 text-xs">{r.ntk50 || 0}</td>
                      <td className="p-4 text-right font-black text-slate-800 border-l border-slate-100">{formatRp(getRowTotal(r))}</td>
                      <td className="p-4 text-center border-l border-slate-100"><div className="flex justify-center gap-3"><button onClick={() => handleEdit(r)} className="text-blue-600 font-semibold hover:text-blue-800 transition-colors text-xs">Edit</button><button onClick={() => hapusData(r.id)} className="text-red-500 font-semibold hover:text-red-700 transition-colors text-xs">Hapus</button></div></td>
                    </tr>
                  ))}
                  {todaySesiRecords.length > 0 && (
                    <tr className="bg-slate-100/80 font-bold border-t-2 border-slate-200">
                      <td colSpan="3" className="p-4 text-center sm:text-right uppercase text-slate-700 text-xs tracking-wider">Total Keseluruhan</td>
                      <td className="p-4 text-right text-emerald-600">{formatRp(livePreviewSums.topup)}</td>
                      <td className="p-4 text-center border-l border-slate-200">
                        <div className="text-blue-700">{livePreviewSums.tk20}</div>
                        {livePreviewSums.tk20 > 0 && <div className="text-[9px] text-slate-500 font-medium mt-0.5">Rp {formatRp(livePreviewSums.tk20 * HARGA_K20)}</div>}
                      </td>
                      <td className="p-4 text-center">
                        <div className="text-blue-700">{livePreviewSums.tk50}</div>
                        {livePreviewSums.tk50 > 0 && <div className="text-[9px] text-slate-500 font-medium mt-0.5">Rp {formatRp(livePreviewSums.tk50 * HARGA_K50)}</div>}
                      </td>
                      <td className="p-4 text-center text-orange-700 border-l border-slate-200">{livePreviewSums.ntk20}</td>
                      <td className="p-4 text-center text-orange-700">{livePreviewSums.ntk50}</td>
                      <td className="p-4 text-right text-slate-900 border-l border-slate-200">{formatRp(livePreviewSums.total)}</td>
                      <td className="p-4 border-l border-slate-200"></td>
                    </tr>
                  )}
                  {todaySesiRecords.length === 0 && <tr><td colSpan="10" className="p-12 text-center text-slate-400 font-medium italic">Belum ada input transaksi di tanggal {formatTanggalStandard(formData.tanggal)} untuk Sesi {activeSesi}.</td></tr>}
                  </tbody></table>
                </div>
              </div>

              {/* SECTION 3: PENDAPATAN TAMBAHAN */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-indigo-50/50 p-5 border-b border-indigo-100">
                  <h3 className="font-bold text-indigo-900 text-base flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Pendapatan Ekstra: <span className="text-indigo-600">{formatTanggalStandard(formData.tanggal)} (Sesi {activeSesi})</span>
                  </h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="group relative">
                    <h4 className="font-bold text-slate-800 mb-3 text-sm">Pendapatan E-Car</h4>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Total Rupiah</label>
                        <input type="text" name="ecarDisplay" value={extraInputData.ecarDisplay} onChange={handleExtraChange} className="w-full border border-slate-300 rounded-xl p-3 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all" placeholder="0" />
                      </div>
                      <div className="w-28">
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5 text-center">Transaksi</label>
                        <div className="w-full border border-slate-200 rounded-xl p-3 bg-slate-100 text-center font-bold text-indigo-600">{extraInputData.ecarTrx || 0}</div>
                      </div>
                    </div>
                  </div>
                  <div className="group relative">
                    <h4 className="font-bold text-slate-800 mb-3 text-sm">Pendapatan Foto Satwa</h4>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Total Rupiah</label>
                        <input type="text" name="fotoDisplay" value={extraInputData.fotoDisplay} onChange={handleExtraChange} className="w-full border border-slate-300 rounded-xl p-3 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all" placeholder="0" />
                      </div>
                      <div className="w-28">
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5 text-center">Transaksi</label>
                        <div className="w-full border border-slate-200 rounded-xl p-3 bg-slate-100 text-center font-bold text-indigo-600">{extraInputData.fotoTrx || 0}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: LAPORAN & DETAIL ANALITIK */}
          {activeTab === 'laporan' && (
            <div className="max-w-7xl mx-auto space-y-6">
              
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-800 tracking-tight mb-2">Laporan & Analitik Terpadu</h2>
                  <p className="text-sm font-medium text-slate-500">Pusat data rekapan harian dan historis TMR.</p>
                </div>
                
                {/* SUB NAVIGATION TAB */}
                <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 w-full lg:w-auto">
                  <button onClick={() => setReportType('umum')} className={`px-5 py-2 rounded-lg font-bold text-xs uppercase tracking-wide transition-all flex-1 lg:flex-none text-center ${reportType === 'umum' ? 'bg-white text-emerald-600 shadow-sm border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>General</button>
                  <button onClick={() => setReportType('jakcard')} className={`px-5 py-2 rounded-lg font-bold text-xs uppercase tracking-wide transition-all flex-1 lg:flex-none text-center ${reportType === 'jakcard' ? 'bg-white text-emerald-600 shadow-sm border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>Jakcard</button>
                  <button onClick={() => setReportType('ecar')} className={`px-5 py-2 rounded-lg font-bold text-xs uppercase tracking-wide transition-all flex-1 lg:flex-none text-center ${reportType === 'ecar' ? 'bg-white text-emerald-600 shadow-sm border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>E-Car</button>
                  <button onClick={() => setReportType('foto')} className={`px-5 py-2 rounded-lg font-bold text-xs uppercase tracking-wide transition-all flex-1 lg:flex-none text-center ${reportType === 'foto' ? 'bg-white text-emerald-600 shadow-sm border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>Foto Satwa</button>
                </div>
              </div>
              
              {/* FILTERING AREA */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Mulai Tanggal</label>
                    <input type="date" value={filter.startDate} max={getTodayStr()} onChange={e => setFilter({...filter, startDate: e.target.value})} className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-semibold text-slate-800 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Hingga Tanggal</label>
                    <input type="date" value={filter.endDate} max={getTodayStr()} onChange={e => setFilter({...filter, endDate: e.target.value})} className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-semibold text-slate-800 transition-all" />
                  </div>
                  
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Sesi</label>
                    <select value={filter.sesi} onChange={e => setFilter({...filter, sesi: e.target.value})} className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-medium text-slate-700 transition-all"><option value="">Semua Sesi</option><option value="Siang">Siang</option><option value="Malam">Malam</option></select>
                  </div>
                  <div className={(reportType === 'ecar' || reportType === 'foto') ? 'hidden' : 'block'}>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Lokasi</label>
                    <select value={filter.lokasi} onChange={e => setFilter({...filter, lokasi: e.target.value})} className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-medium text-slate-700 transition-all"><option value="">Semua Lokasi</option>{lokasiList.map((l, i) => <option key={i} value={l}>{l}</option>)}</select>
                  </div>
                  <div className={(reportType === 'ecar' || reportType === 'foto') ? 'hidden' : 'block'}>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Petugas</label>
                    <select value={filter.petugas} onChange={e => setFilter({...filter, petugas: e.target.value})} className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-medium text-slate-700 transition-all"><option value="">Semua Petugas</option>{petugasList.map((p, i) => <option key={i} value={p}>{p}</option>)}</select>
                  </div>
                </div>
              </div>

              {/* ========================================= */}
              {/* SUB-VIEW 1: LAPORAN GENERAL */}
              {/* ========================================= */}
              {reportType === 'umum' && (
                <>
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[300px]">
                    <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex justify-between items-center"><span className="font-bold text-slate-800 text-sm">Tabel Detail Transaksi Jakcard</span><span className="bg-slate-200 text-slate-700 font-bold text-[10px] px-2 py-1 rounded-md">{filteredAndSortedRecords.length} Record</span></div>
                    <div className="flex-1 overflow-auto custom-scrollbar">
                      <table className="min-w-full text-xs text-left"><thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200 font-bold uppercase tracking-wider text-[10px]"><tr>
                        <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('tanggal')}>Tgl {sortConfig.key === 'tanggal' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                        <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('sesi')}>Sesi</th>
                        <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('nama')}>Petugas</th>
                        <th className="p-4">Lokasi</th><th className="p-4 text-right">Top Up (Rp)</th><th className="p-4 text-center border-l border-slate-200 bg-slate-50/50">T.20</th><th className="p-4 text-center bg-slate-50/50">T.50</th><th className="p-4 text-center border-l border-slate-200 bg-slate-50/50">NT.20</th><th className="p-4 text-center bg-slate-50/50">NT.50</th><th className="p-4 text-right cursor-pointer" onClick={() => requestSort('total')}>Grand Total</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100 bg-white">{filteredAndSortedRecords.map(r => (
                        <tr key={r.id} className="hover:bg-slate-50 transition-colors"><td className="p-4 font-semibold text-slate-700 whitespace-nowrap">{formatTanggalStandard(r.tanggal)}<span className="block text-[10px] text-slate-400 font-normal">{r.jam_input} WIB</span></td><td className="p-4 font-bold text-emerald-600 text-[10px] uppercase">{r.sesi}</td><td className="p-4 font-semibold text-slate-800">{r.nama}</td><td className="p-4 text-slate-600 font-medium">{r.lokasi}</td><td className="p-4 text-right font-bold text-emerald-600">{formatRp(r.topup)}</td><td className="p-4 text-center border-l border-slate-100 font-semibold text-blue-600">{r.tk20 || 0}</td><td className="p-4 text-center font-semibold text-blue-600">{r.tk50 || 0}</td><td className="p-4 text-center border-l border-slate-100 font-semibold text-orange-600">{r.ntk20 || 0}</td><td className="p-4 text-center font-semibold text-orange-600">{r.ntk50 || 0}</td><td className="p-4 text-right font-black text-slate-800">{formatRp(getRowTotal(r))}</td></tr>
                      ))}
                      {filteredAndSortedRecords.length === 0 && <tr><td colSpan="10" className="p-16 text-center text-slate-400 font-medium italic">Tidak ada data transaksi yang sesuai dengan filter.</td></tr>}
                      </tbody></table>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <h4 className="font-bold text-slate-500 text-[10px] uppercase tracking-widest mb-4">Total Penjualan Jakcard</h4>
                      <div className="flex justify-between font-medium text-slate-700 mb-2 text-sm"><span>Kartu 20K</span><span className="font-bold">{(currentSums.tk20||0)+(currentSums.ntk20||0)} Pcs</span></div>
                      <div className="flex justify-between font-medium text-slate-700 mb-4 text-sm"><span>Kartu 50K</span><span className="font-bold">{(currentSums.tk50||0)+(currentSums.ntk50||0)} Pcs</span></div>
                      <div className="flex justify-between font-black text-2xl text-slate-800 border-t border-slate-100 pt-4"><span><span className="text-sm text-slate-400 font-bold mr-1">Rp</span></span><span>{formatRp(((currentSums.tk20+currentSums.ntk20)*45000)+((currentSums.tk50+currentSums.ntk50)*75000))}</span></div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <h4 className="font-bold text-slate-500 text-[10px] uppercase tracking-widest mb-4">Total Pendapatan E-Car</h4>
                      <div className="flex justify-between font-medium text-slate-700 mb-11 text-sm"><span>Volume Transaksi</span><span className="font-bold">{extraSums.ecarTrx} Trx</span></div>
                      <div className="flex justify-between font-black text-2xl text-slate-800 border-t border-slate-100 pt-4"><span><span className="text-sm text-slate-400 font-bold mr-1">Rp</span></span><span>{formatRp(extraSums.ecarRaw)}</span></div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <h4 className="font-bold text-slate-500 text-[10px] uppercase tracking-widest mb-4">Total Foto Satwa</h4>
                      <div className="flex justify-between font-medium text-slate-700 mb-11 text-sm"><span>Volume Transaksi</span><span className="font-bold">{extraSums.fotoTrx} Trx</span></div>
                      <div className="flex justify-between font-black text-2xl text-slate-800 border-t border-slate-100 pt-4"><span><span className="text-sm text-slate-400 font-bold mr-1">Rp</span></span><span>{formatRp(extraSums.fotoRaw)}</span></div>
                    </div>
                  </div>
                </>
              )}

              {/* ========================================= */}
              {/* SUB-VIEW 2: LAPORAN KHUSUS JAKCARD */}
              {/* ========================================= */}
              {reportType === 'jakcard' && (
                <div className="space-y-6">
                  <div className="bg-gradient-to-r from-emerald-600 to-teal-500 text-white p-8 rounded-3xl shadow-md flex flex-col md:flex-row justify-between items-center">
                    <div>
                      <h3 className="text-2xl font-black tracking-tight mb-1">Rekap Jakcard & Topup</h3>
                      <p className="text-emerald-100 text-xs font-semibold tracking-wider opacity-90">{formatTanggalStandard(filter.startDate)} <span className="mx-1">&mdash;</span> {formatTanggalStandard(filter.endDate)}</p>
                    </div>
                    <div className="mt-6 md:mt-0 text-right bg-white/10 px-6 py-4 rounded-2xl backdrop-blur-sm border border-white/20">
                      <div className="text-emerald-100 text-[10px] font-bold uppercase tracking-widest mb-1">Total Perputaran Rupiah</div>
                      <div className="text-3xl font-black tracking-tighter">Rp {formatRp(((currentSums.tk20+currentSums.ntk20)*45000)+((currentSums.tk50+currentSums.ntk50)*75000) + currentSums.topup)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm text-center flex flex-col justify-center"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Total K.20 (Pcs)</div><div className="text-4xl font-black text-slate-700">{(currentSums.tk20||0)+(currentSums.ntk20||0)}</div></div>
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm text-center flex flex-col justify-center"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Total K.50 (Pcs)</div><div className="text-4xl font-black text-slate-700">{(currentSums.tk50||0)+(currentSums.ntk50||0)}</div></div>
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm text-center flex flex-col justify-center"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Total Top Up (Rp)</div><div className="text-2xl font-black text-emerald-600 mt-2">Rp {formatRp(currentSums.topup)}</div></div>
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm text-center flex flex-col justify-center"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Total Record Data</div><div className="text-4xl font-black text-emerald-500">{filteredAndSortedRecords.length}</div></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                      <h4 className="font-bold text-slate-800 text-base mb-6">Rincian Penjualan Tunai</h4>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center"><span className="font-medium text-slate-500 text-sm">Kartu 20K</span><span className="font-black text-xl text-slate-800">{currentSums.tk20 || 0} <span className="text-xs text-slate-400 font-semibold ml-1">Pcs</span></span></div>
                        <div className="w-full h-px bg-slate-100"></div>
                        <div className="flex justify-between items-center"><span className="font-medium text-slate-500 text-sm">Kartu 50K</span><span className="font-black text-xl text-slate-800">{currentSums.tk50 || 0} <span className="text-xs text-slate-400 font-semibold ml-1">Pcs</span></span></div>
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-500"></div>
                      <h4 className="font-bold text-slate-800 text-base mb-6">Rincian Penjualan Non-Tunai</h4>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center"><span className="font-medium text-slate-500 text-sm">Kartu 20K</span><span className="font-black text-xl text-slate-800">{currentSums.ntk20 || 0} <span className="text-xs text-slate-400 font-semibold ml-1">Pcs</span></span></div>
                        <div className="w-full h-px bg-slate-100"></div>
                        <div className="flex justify-between items-center"><span className="font-medium text-slate-500 text-sm">Kartu 50K</span><span className="font-black text-xl text-slate-800">{currentSums.ntk50 || 0} <span className="text-xs text-slate-400 font-semibold ml-1">Pcs</span></span></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================= */}
              {/* SUB-VIEW 3: LAPORAN KHUSUS E-CAR */}
              {/* ========================================= */}
              {reportType === 'ecar' && (
                <div className="space-y-6">
                  <div className="bg-slate-800 text-white p-8 rounded-3xl shadow-md flex flex-col md:flex-row justify-between items-center">
                    <div>
                      <h3 className="text-2xl font-black tracking-tight mb-1 text-blue-400">Rekap E-Car</h3>
                      <p className="text-slate-400 text-xs font-semibold tracking-wider opacity-90">{formatTanggalStandard(filter.startDate)} <span className="mx-1">&mdash;</span> {formatTanggalStandard(filter.endDate)}</p>
                    </div>
                    <div className="mt-6 md:mt-0 flex gap-6">
                       <div className="bg-white/5 px-6 py-4 rounded-2xl border border-white/10 text-center"><div className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Total Transaksi</div><div className="text-2xl font-black text-white">{extraSums.ecarTrx} Trx</div></div>
                       <div className="bg-blue-500/10 px-6 py-4 rounded-2xl border border-blue-500/20 text-center"><div className="text-blue-300 text-[10px] font-bold uppercase tracking-widest mb-1">Total Pendapatan</div><div className="text-2xl font-black text-white">Rp {formatRp(extraSums.ecarRaw)}</div></div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="min-w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase tracking-wider text-[10px]"><tr>
                      <th className="p-5">Tanggal Operasional</th><th className="p-5 text-center">Sesi</th><th className="p-5 text-center">Volume Transaksi</th><th className="p-5 text-right">Nominal Pendapatan</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">{filteredExtraRecords.map(r => (r.ecarRaw > 0 || r.ecarTrx > 0) && (
                      <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-5 font-semibold text-slate-700">{formatTanggalStandard(r.tanggal || r.id.split('_')[0])}</td>
                        <td className="p-5 text-center font-bold text-emerald-600 text-[10px] uppercase">{r.sesi || 'Siang'}</td>
                        <td className="p-5 text-center font-bold text-slate-600">{r.ecarTrx} <span className="text-xs font-normal text-slate-400 ml-1">Trx</span></td>
                        <td className="p-5 text-right font-black text-slate-800">Rp {formatRp(r.ecarRaw)}</td>
                      </tr>
                    ))}
                    {filteredExtraRecords.filter(r => r.ecarRaw > 0 || r.ecarTrx > 0).length === 0 && <tr><td colSpan="4" className="p-16 text-center text-slate-400 font-medium italic">Tidak ada catatan transaksi E-Car pada periode yang dipilih.</td></tr>}
                    </tbody></table>
                  </div>
                </div>
              )}

              {/* ========================================= */}
              {/* SUB-VIEW 4: LAPORAN KHUSUS FOTO SATWA */}
              {/* ========================================= */}
              {reportType === 'foto' && (
                <div className="space-y-6">
                  <div className="bg-slate-800 text-white p-8 rounded-3xl shadow-md flex flex-col md:flex-row justify-between items-center">
                    <div>
                      <h3 className="text-2xl font-black tracking-tight mb-1 text-orange-400">Rekap Foto Satwa</h3>
                      <p className="text-slate-400 text-xs font-semibold tracking-wider opacity-90">{formatTanggalStandard(filter.startDate)} <span className="mx-1">&mdash;</span> {formatTanggalStandard(filter.endDate)}</p>
                    </div>
                    <div className="mt-6 md:mt-0 flex gap-6">
                       <div className="bg-white/5 px-6 py-4 rounded-2xl border border-white/10 text-center"><div className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Total Transaksi</div><div className="text-2xl font-black text-white">{extraSums.fotoTrx} Trx</div></div>
                       <div className="bg-orange-500/10 px-6 py-4 rounded-2xl border border-orange-500/20 text-center"><div className="text-orange-300 text-[10px] font-bold uppercase tracking-widest mb-1">Total Pendapatan</div><div className="text-2xl font-black text-white">Rp {formatRp(extraSums.fotoRaw)}</div></div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="min-w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase tracking-wider text-[10px]"><tr>
                      <th className="p-5">Tanggal Operasional</th><th className="p-5 text-center">Sesi</th><th className="p-5 text-center">Volume Transaksi</th><th className="p-5 text-right">Nominal Pendapatan</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">{filteredExtraRecords.map(r => (r.fotoRaw > 0 || r.fotoTrx > 0) && (
                      <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-5 font-semibold text-slate-700">{formatTanggalStandard(r.tanggal || r.id.split('_')[0])}</td>
                        <td className="p-5 text-center font-bold text-emerald-600 text-[10px] uppercase">{r.sesi || 'Siang'}</td>
                        <td className="p-5 text-center font-bold text-slate-600">{r.fotoTrx} <span className="text-xs font-normal text-slate-400 ml-1">Trx</span></td>
                        <td className="p-5 text-right font-black text-slate-800">Rp {formatRp(r.fotoRaw)}</td>
                      </tr>
                    ))}
                    {filteredExtraRecords.filter(r => r.fotoRaw > 0 || r.fotoTrx > 0).length === 0 && <tr><td colSpan="4" className="p-16 text-center text-slate-400 font-medium italic">Tidak ada catatan transaksi Foto Satwa pada periode yang dipilih.</td></tr>}
                    </tbody></table>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB: CETAK TABEL (Print 1) */}
          <div className={activeTab === 'print1' ? 'block print:block max-w-7xl mx-auto' : 'hidden print:hidden'}>
            <div className="mb-6 print:hidden flex flex-col sm:flex-row justify-between items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"><div className="flex items-center gap-4"><span className="text-sm font-bold text-slate-700">Pengaturan Cetak:</span><select value={filter.sesi} onChange={e => setFilter({...filter, sesi: e.target.value})} className="border border-slate-300 rounded-lg p-2 outline-none font-semibold focus:ring-2 focus:ring-emerald-500 text-sm"><option value="">Gabungan Semua Sesi</option><option value="Siang">Sesi Siang</option><option value="Malam">Sesi Malam</option></select></div><button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-8 rounded-xl shadow-md transition-all">Cetak PDF / Print</button></div>
            <div className="bg-white p-4 md:p-10 w-full min-h-[297mm] shadow-lg print:shadow-none text-xs sm:text-sm border border-slate-200"><div className="text-center mb-8 border-b-2 border-slate-800 pb-4"><h1 className="font-extrabold text-lg md:text-xl uppercase tracking-tight text-slate-900">REKAP PENERIMAAN SETORAN PENJUALAN KARTU JAKCARD DAN TOPUP</h1><h2 className="font-bold text-md uppercase text-slate-700">UNIT PENGELOLA TAMAN MARGASATWA RAGUNAN</h2></div><div className="flex justify-between mb-4 font-bold text-sm uppercase text-slate-800"><div>Hari/Tanggal : {filter.startDate === filter.endDate ? formatTanggalHari(filter.startDate) : (filter.startDate ? `${formatTanggalStandard(filter.startDate)} s/d ${formatTanggalStandard(filter.endDate)}` : 'SEMUA PERIODE')}</div><div>Sesi : {filter.sesi ? filter.sesi : 'SIANG & MALAM'}</div></div>
              <table className="w-full border-collapse border-2 border-slate-800 mb-6 text-[10px] md:text-[11px]"><thead className="bg-slate-100 text-center font-bold uppercase text-slate-800"><tr><th className="border-2 border-slate-800 p-2" rowSpan="2">NO</th><th className="border-2 border-slate-800 p-2" rowSpan="2">Nama Petugas</th><th className="border-2 border-slate-800 p-2" rowSpan="2">Lokasi</th><th className="border-2 border-slate-800 p-2" rowSpan="2">TOP UP (Rp)</th><th className="border-2 border-slate-800 p-2" colSpan="2">Tunai (Pcs)</th><th className="border-2 border-slate-800 p-2" colSpan="2">Non Tunai (Pcs)</th><th className="border-2 border-slate-800 p-2" rowSpan="2">Jumlah (Rp)</th><th className="border-2 border-slate-800 p-2" rowSpan="2">Keterangan</th></tr><tr><th className="border-2 border-slate-800 p-1">K. 20</th><th className="border-2 border-slate-800 p-1">K. 50</th><th className="border-2 border-slate-800 p-1">K. 20</th><th className="border-2 border-slate-800 p-1">K. 50</th></tr></thead>
              <tbody className="text-slate-800 font-medium">{filteredAndSortedRecords.map((r, i) => (<tr key={r.id} className="even:bg-slate-50"><td className="border-2 border-slate-800 p-2 text-center">{i + 1}</td><td className="border-2 border-slate-800 p-2 font-semibold">{r.nama}</td><td className="border-2 border-slate-800 p-2">{r.lokasi}</td><td className="border-2 border-slate-800 p-2 text-right font-bold">{formatRp(r.topup)}</td><td className="border-2 border-slate-800 p-2 text-center">{r.tk20 || 0}</td><td className="border-2 border-slate-800 p-2 text-center">{r.tk50 || 0}</td><td className="border-2 border-slate-800 p-2 text-center">{r.ntk20 || 0}</td><td className="border-2 border-slate-800 p-2 text-center">{r.ntk50 || 0}</td><td className="border-2 border-slate-800 p-2 text-right font-bold">{formatRp(getRowTotal(r))}</td><td className="border-2 border-slate-800 p-2 text-center italic text-slate-600">{r.ket}</td></tr>))}
              <tr className="bg-slate-200 font-bold"><td className="border-2 border-slate-800 p-2 text-center uppercase" colSpan="3">Total Keseluruhan</td><td className="border-2 border-slate-800 p-2 text-right">{formatRp(currentSums.topup)}</td><td className="border-2 border-slate-800 p-2 text-center">{currentSums.tk20}</td><td className="border-2 border-slate-800 p-2 text-center">{currentSums.tk50}</td><td className="border-2 border-slate-800 p-2 text-center">{currentSums.ntk20}</td><td className="border-2 border-slate-800 p-2 text-center">{currentSums.ntk50}</td><td className="border-2 border-slate-800 p-2 text-right text-sm">{formatRp(currentSums.total)}</td><td className="border-2 border-slate-800"></td></tr></tbody></table>
              <div className="flex justify-end"><div className="w-72 border-2 border-slate-800 p-3 font-bold text-xs bg-slate-50 text-slate-800"><div className="flex justify-between border-b border-slate-400 pb-2 mb-2"><span>PENDAPATAN E-CAR :</span><span>Rp {formatRp(extraSums.ecarRaw)}</span></div><div className="flex justify-between"><span>FOTO SATWA :</span><span>Rp {formatRp(extraSums.fotoRaw)}</span></div></div></div>
            </div>
          </div>

          {/* TAB: CETAK REKAP (Print 2) */}
          <div className={activeTab === 'print2' ? 'block print:block' : 'hidden print:hidden'}>
            <div className="mb-6 print:hidden flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-200 max-w-[210mm] mx-auto shadow-sm">
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold text-slate-700">Pengaturan Cetak:</span>
                <select value={filter.sesi} onChange={e => setFilter({...filter, sesi: e.target.value})} className="border border-slate-300 rounded-lg p-2 outline-none font-semibold focus:ring-2 focus:ring-emerald-500 text-sm">
                  <option value="">Gabungan Semua Sesi</option>
                  <option value="Siang">Sesi Siang</option>
                  <option value="Malam">Sesi Malam</option>
                </select>
              </div>
              <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-8 rounded-xl shadow-md transition-all">Cetak Rekapitulasi</button>
            </div>

            <div className="bg-white max-w-[210mm] min-h-[297mm] mx-auto p-12 shadow-xl border border-slate-200 print:shadow-none print:border-none print:p-0 text-[14px] text-slate-900">
              <div className="text-center mb-6 border-b-2 border-slate-800 pb-4"><h1 className="text-xl font-extrabold uppercase tracking-widest text-slate-900">Taman Margasatwa Ragunan</h1><p className="text-base uppercase tracking-[0.2em] font-semibold text-slate-700">Jakarta - Indonesia</p></div>
              <div className="border-2 border-slate-800 py-2 mb-6 text-center font-bold uppercase bg-slate-100"><h2 className="text-[16px] tracking-widest text-slate-800">Rekap Penjualan Kartu Jakcard dan Top Up</h2></div>
              <div className="flex justify-between font-bold mb-4 pb-2 text-[13px] text-slate-800"><div>HARI/TANGGAL : {filter.startDate === filter.endDate ? formatTanggalHari(filter.startDate) : (filter.startDate ? `${formatTanggalStandard(filter.startDate)} s/d ${formatTanggalStandard(filter.endDate)}` : 'SEMUA PERIODE')}</div><div className="uppercase">OPERASIONAL : {filter.sesi ? filter.sesi : 'FULL SESSION'}</div></div>
              
              <div className="border-2 border-slate-800">
                <div className="flex p-5"><div className="w-[30%] font-bold uppercase text-slate-600 tracking-wider text-xs pt-1">Penjualan Kartu</div><div className="w-[70%] text-slate-800"><div className="flex mb-2 font-semibold"><div className="w-16">K. 20</div><div className="w-4">=</div><div className="w-12 text-center">{(currentSums.tk20 || 0) + (currentSums.ntk20 || 0)}</div><div className="w-10 text-xs text-center mt-0.5 text-slate-500">Pcs</div><div className="w-6 text-center text-slate-400">x</div><div className="w-8">Rp.</div><div className="w-20 text-right">25.000</div><div className="w-6 text-center text-slate-400">=</div><div className="w-8 text-slate-500">Rp.</div><div className="w-24 text-right">{formatRp(reportData.kartu20Rp)}</div><div className="w-8"></div></div><div className="flex mb-2 font-semibold"><div className="w-16">K. 50</div><div className="w-4">=</div><div className="w-12 text-center">{(currentSums.tk50 || 0) + (currentSums.ntk50 || 0)}</div><div className="w-10 text-xs text-center mt-0.5 text-slate-500">Pcs</div><div className="w-6 text-center text-slate-400">x</div><div className="w-8">Rp.</div><div className="w-20 text-right">25.000</div><div className="w-6 text-center text-slate-400">=</div><div className="w-8 border-b border-slate-800 pb-1 text-slate-500">Rp.</div><div className="w-24 text-right border-b border-slate-800 pb-1">{formatRp(reportData.kartu50Rp)}</div><div className="w-8 text-center font-bold mt-1 text-slate-500">(+)</div></div><div className="flex mt-3 font-bold"><div className="flex-1 text-right pr-6 uppercase text-slate-600 text-xs tracking-wider pt-1">Total Kartu :</div><div className="w-8 text-slate-600">Rp.</div><div className="w-24 text-right text-base">{formatRp(totalKartu)}</div><div className="w-8"></div></div></div></div>
                <div className="border-t border-dashed border-slate-300 mx-5"></div>
                <div className="flex p-5"><div className="w-[30%] font-bold uppercase text-slate-600 tracking-wider text-xs pt-1">Isi Saldo</div><div className="w-[70%] text-slate-800"><div className="flex mb-2 font-semibold"><div className="w-16">S. 20</div><div className="w-4">=</div><div className="w-12 text-center">{(currentSums.tk20 || 0) + (currentSums.ntk20 || 0)}</div><div className="w-10 text-xs text-center mt-0.5 text-slate-500">Pcs</div><div className="w-6 text-center text-slate-400">x</div><div className="w-8">Rp.</div><div className="w-20 text-right">20.000</div><div className="w-6 text-center text-slate-400">=</div><div className="w-8 text-slate-500">Rp.</div><div className="w-24 text-right">{formatRp(reportData.saldo20Rp)}</div><div className="w-8"></div></div><div className="flex mb-2 font-semibold"><div className="w-16">S. 50</div><div className="w-4">=</div><div className="w-12 text-center">{(currentSums.tk50 || 0) + (currentSums.ntk50 || 0)}</div><div className="w-10 text-xs text-center mt-0.5 text-slate-500">Pcs</div><div className="w-6 text-center text-slate-400">x</div><div className="w-8">Rp.</div><div className="w-20 text-right">50.000</div><div className="w-6 text-center text-slate-400">=</div><div className="w-8 border-b border-slate-800 pb-1 text-slate-500">Rp.</div><div className="w-24 text-right border-b border-slate-800 pb-1">{formatRp(reportData.saldo50Rp)}</div><div className="w-8 text-center font-bold mt-1 text-slate-500">(+)</div></div><div className="flex mt-3 font-bold"><div className="flex-1 text-right pr-6 uppercase text-slate-600 text-xs tracking-wider pt-1">Total Saldo :</div><div className="w-8 text-slate-600">Rp.</div><div className="w-24 text-right text-base">{formatRp(totalSaldo)}</div><div className="w-8"></div></div></div></div>
                
                <div className="border-t-2 border-slate-800 flex text-slate-900 bg-slate-50/50">
                  <div className="w-[55%] p-6 font-bold border-r-2 border-slate-800 flex flex-col justify-center"><div className="flex justify-between mb-2"><div className="w-40 uppercase text-xs tracking-wider pt-1 text-slate-600">Subtotal Jakcard</div><div className="w-4">:</div><div className="w-8 text-slate-500">Rp.</div><div className="flex-1 text-right text-base">{formatRp(totalPenjualanJakcard)}</div></div><div className="flex justify-between mb-3"><div className="w-40 uppercase text-xs tracking-wider pt-1 text-slate-600">Subtotal Top Up</div><div className="w-4">:</div><div className="w-8 border-b border-slate-800 pb-1 text-slate-500">Rp.</div><div className="flex-1 text-right border-b border-slate-800 pb-1 text-base">{formatRp(currentSums.topup)}</div></div><div className="flex justify-between mt-3 text-lg"><div className="w-40 text-right pr-4 uppercase tracking-widest text-slate-800">Grand Total</div><div className="w-4">:</div><div className="w-8 font-black">Rp.</div><div className="flex-1 text-right font-black">{formatRp(grandTotal)}</div></div></div>
                  <div className="w-[45%] p-6 text-xs font-semibold flex flex-col justify-center"><div className="font-bold uppercase tracking-wider text-[10px] text-slate-400 mb-3">Memo Transaksi Non-Tunai</div><div className="flex justify-between mb-2 text-slate-700"><div className="w-32">Kartu / Saldo 20 NT</div><div>:</div><div className="flex-1 text-right pr-2 font-bold text-sm">{currentSums.ntk20}</div><div className="text-slate-500">Pcs</div></div><div className="flex justify-between text-slate-700"><div className="w-32">Kartu / Saldo 50 NT</div><div>:</div><div className="flex-1 text-right pr-2 font-bold text-sm">{currentSums.ntk50}</div><div className="text-slate-500">Pcs</div></div></div>
                </div>

                <div className="border-t-2 border-slate-800 p-6 font-bold text-sm bg-white"><div className="flex mb-3"><div className="w-48 text-slate-600 uppercase tracking-wider text-xs pt-1">Pendapatan E-Car</div><div className="w-4">:</div><div className="w-8 text-slate-500">Rp.</div><div className="w-32 text-right">{formatRp(extraSums.ecarRaw)}</div><div className="ml-4 font-semibold text-slate-400 text-xs pt-0.5">({extraSums.ecarTrx || 0} Trx)</div></div><div className="flex"><div className="w-48 text-slate-600 uppercase tracking-wider text-xs pt-1">Foto Satwa Jinak</div><div className="w-4">:</div><div className="w-8 text-slate-500">Rp.</div><div className="w-32 text-right">{formatRp(extraSums.fotoRaw)}</div><div className="ml-4 font-semibold text-slate-400 text-xs pt-0.5">({extraSums.fotoTrx || 0} Trx)</div></div></div>
              </div>

              <div className="mt-16 flex justify-between font-bold text-center px-10 text-slate-800"><div className="w-64"><div className="mb-20 uppercase tracking-wider text-xs text-slate-500">Bendahara Penerima</div><div className="border-b border-slate-800 text-base">{penandatangan.bendahara || '......................................'}</div></div><div className="w-64"><div className="mb-20 uppercase tracking-wider text-xs text-slate-500">Pemeriksa Setoran</div><div className="border-b border-slate-800 text-base">{penandatangan.pemeriksa || '......................................'}</div></div></div>
              <div className="mt-10 text-[10px] text-slate-400 font-medium text-right">Dicetak otomatis oleh Sistem Rekap TMR Cloud pada: {formatTanggalStandard(getTodayStr())}</div>
            </div>
          </div>

          {/* TAB: CETAK BUKTI SETOR (Print 3 - F4 Layout) */}
          <div className={activeTab === 'print3' ? 'block' : 'hidden'}>
            
            {/* Tampilan 1: Tabel Pemilihan Data */}
            {!selectedRecordForPrint && (
              <div className="max-w-6xl mx-auto space-y-6 print:hidden">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 tracking-tight mb-1">Cetak Bukti Setor & Berita Acara</h2>
                    <p className="text-sm font-medium text-slate-500">Pilih data setoran petugas yang ingin dicetak ke lembar F4.</p>
                  </div>
                  <div className="flex gap-4">
                    <input type="date" value={filter.startDate} onChange={e => setFilter({...filter, startDate: e.target.value, endDate: e.target.value})} className="border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-semibold" />
                    <select value={filter.sesi} onChange={e => setFilter({...filter, sesi: e.target.value})} className="border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-semibold">
                      <option value="">Semua Sesi</option><option value="Siang">Sesi Siang</option><option value="Malam">Sesi Malam</option>
                    </select>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <table className="min-w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <tr>
                        <th className="p-4">Tanggal & Sesi</th>
                        <th className="p-4">Nama Petugas</th>
                        <th className="p-4">Lokasi Loket</th>
                        <th className="p-4 text-right">Total Setoran (Tunai)</th>
                        <th className="p-4 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAndSortedRecords.map(r => (
                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-semibold text-slate-700">{formatTanggalStandard(r.tanggal)} <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded ml-2 uppercase">{r.sesi}</span></td>
                          <td className="p-4 font-bold text-slate-800">{r.nama}</td>
                          <td className="p-4 text-slate-600">{r.lokasi}</td>
                          <td className="p-4 text-right font-black text-emerald-600">Rp {formatRp(getRowTotal(r))}</td>
                          <td className="p-4 text-center">
                            <button onClick={() => setSelectedRecordForPrint(r)} className="bg-emerald-100 hover:bg-emerald-600 hover:text-white text-emerald-700 font-bold py-1.5 px-4 rounded-lg transition-colors text-xs border border-emerald-200 shadow-sm">
                              Pilih & Cetak
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredAndSortedRecords.length === 0 && <tr><td colSpan="5" className="p-12 text-center text-slate-400 font-medium italic">Data tidak ditemukan. Silakan sesuaikan tanggal pencarian.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tampilan 2: Layout F4 Print Ready */}
            {selectedRecordForPrint && (
              <div className="pb-10">
                <div className="max-w-[215mm] mx-auto mb-6 print:hidden flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <button onClick={() => setSelectedRecordForPrint(null)} className="text-slate-500 hover:text-slate-800 font-semibold text-sm flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg> Kembali ke Daftar
                  </button>
                  <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-8 rounded-lg shadow-md transition-all text-sm">
                    Cetak Dokumen Sekarang
                  </button>
                </div>

                {/* AREA KERTAS F4 */}
                <div className="bg-white w-full sm:w-[215mm] min-h-[330mm] mx-auto p-6 sm:p-10 border border-slate-200 shadow-xl print:shadow-none print:border-none print:p-0 print:w-full font-sans text-slate-900 box-border relative">
                  
                  {/* BAGIAN 1: BUKTI SETOR BANK */}
                  <div className="w-full">
                    <div className="border-2 border-black mb-4 py-2 px-4 bg-slate-100/50">
                      <h1 className="text-center font-bold text-lg uppercase tracking-wider">BUKTI SETOR BANK</h1>
                    </div>

                    <div className="grid grid-cols-[120px_10px_1fr] gap-y-1 font-semibold text-[13px] mb-4 px-2">
                      <div>Hari/Tanggal</div><div>:</div><div>{formatTanggalHari(selectedRecordForPrint.tanggal)}</div>
                      <div>Nama Petugas</div><div>:</div><div>{selectedRecordForPrint.nama}</div>
                      <div>Nama Loket</div><div>:</div><div>{selectedRecordForPrint.lokasi}</div>
                    </div>

                    <table className="w-full border-collapse border-2 border-black text-[13px] font-semibold mb-6">
                      <thead className="bg-slate-100/50">
                        <tr>
                          <th className="border-2 border-black p-2 w-10"></th>
                          <th className="border-2 border-black p-2 uppercase">JENIS SETORAN</th>
                          <th className="border-2 border-black p-2 uppercase w-40">NOMINAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-black p-2 text-center border-l-2">1</td>
                          <td className="border border-black p-2">
                            <div className="flex justify-between">
                               <span>Penjualan Saldo 20.000 =</span>
                               <span className="font-normal">x 45 ribu</span>
                               <span className="w-10 text-center font-bold">{selectedRecordForPrint.tk20 || 0}</span>
                            </div>
                          </td>
                          <td className="border border-black border-r-2 p-2">
                            <div className="flex justify-between"><span>Rp.</span> <span>{formatRp((selectedRecordForPrint.tk20 || 0) * 45000)}</span></div>
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-black p-2 text-center border-l-2">2</td>
                          <td className="border border-black p-2">
                            <div className="flex justify-between">
                               <span>Penjualan Saldo 50.000 =</span>
                               <span className="font-normal">x 75 ribu</span>
                               <span className="w-10 text-center font-bold">{selectedRecordForPrint.tk50 || 0}</span>
                            </div>
                          </td>
                          <td className="border border-black border-r-2 p-2">
                            <div className="flex justify-between"><span>Rp.</span> <span>{formatRp((selectedRecordForPrint.tk50 || 0) * 75000)}</span></div>
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-black p-2 text-center border-l-2">3</td>
                          <td className="border border-black p-2">Top Up Tunai</td>
                          <td className="border border-black border-r-2 p-2">
                            <div className="flex justify-between"><span>Rp.</span> <span>{formatRp(selectedRecordForPrint.topup || 0)}</span></div>
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-black p-2 text-center border-l-2">4</td>
                          <td className="border border-black p-2 text-transparent select-none border-b border-dotted border-black mx-2 block w-[90%] h-5">.</td>
                          <td className="border border-black border-r-2 p-2">
                            <div className="flex justify-between"><span>Rp.</span> <span></span></div>
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-black p-2 border-l-2"></td>
                          <td className="border border-black p-2"></td>
                          <td className="border border-black border-r-2 p-2">
                            <div className="flex justify-between"><span>Rp.</span> <span></span></div>
                          </td>
                        </tr>
                        <tr>
                          <td colSpan="2" className="border border-black p-2 pl-4 border-l-2">Sub. Jumlah</td>
                          <td className="border border-black border-r-2 p-2">
                            <div className="flex justify-between"><span>Rp.</span> <span className="font-bold">{formatRp(getRowTotal(selectedRecordForPrint))}</span></div>
                          </td>
                        </tr>
                        <tr>
                          <td colSpan="2" className="border border-black p-2 pl-4 border-l-2">Setoran Awal</td>
                          <td className="border border-black border-r-2 p-2">
                            <div className="flex justify-between"><span>Rp.</span> <span></span></div>
                          </td>
                        </tr>
                        <tr>
                          <td colSpan="2" className="border-2 border-black p-2 pl-4 font-bold bg-slate-100/50">Jumlah Total</td>
                          <td className="border-2 border-black p-2 bg-slate-100/50">
                            <div className="flex justify-between font-bold"><span>Rp.</span> <span>{formatRp(getRowTotal(selectedRecordForPrint))}</span></div>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="flex justify-between text-center text-[13px] font-semibold mt-8 px-4 pb-4">
                      <div className="w-40 flex flex-col">
                         <div className="mb-16">Bendahara Penerima,</div>
                         <div>( <span className="inline-block w-32 border-b border-black border-dotted pb-0.5 text-xs">{penandatangan.bendahara}</span> )</div>
                      </div>
                      <div className="w-40 flex flex-col">
                         <div className="mb-16">Petugas Bank DKI,</div>
                         <div>( <span className="inline-block w-32 border-b border-black border-dotted pb-0.5"></span> )</div>
                      </div>
                      <div className="w-40 flex flex-col">
                         <div className="mb-16">Petugas Loket,</div>
                         <div>( <span className="inline-block w-32 border-b border-black border-dotted pb-0.5 text-xs">{selectedRecordForPrint.nama}</span> )</div>
                      </div>
                    </div>
                  </div>

                  {/* GARIS POTONG */}
                  <div className="w-full flex items-center justify-center my-8 print:my-10 opacity-60">
                     <div className="flex-1 border-t-2 border-dashed border-slate-500"></div>
                     <svg className="w-5 h-5 mx-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"></path></svg>
                     <div className="flex-1 border-t-2 border-dashed border-slate-500"></div>
                  </div>

                  {/* BAGIAN 2: BERITA ACARA */}
                  <div className="w-full border-2 border-black p-1 box-border">
                    <div className="w-full border border-black p-6 box-border min-h-[135mm] flex flex-col">
                      
                      <h2 className="text-center font-bold text-lg uppercase tracking-wider mb-8 underline underline-offset-4">BERITA ACARA SERAH TERIMA UANG</h2>

                      <div className="text-[13px] font-semibold leading-relaxed space-y-4 flex-1">
                        
                        <div className="flex items-center gap-2">
                           {(()=>{ const dp = getDateParts(selectedRecordForPrint.tanggal); return (
                             <>
                               Pada Hari Ini, <span className="inline-block w-20 text-center border-b border-black border-dotted pb-0.5">{dp.hari}</span> 
                               Tanggal <span className="inline-block w-12 text-center border-b border-black border-dotted pb-0.5">{dp.tgl}</span> 
                               Bulan <span className="inline-block w-24 text-center border-b border-black border-dotted pb-0.5">{dp.bln}</span> 
                               Tahun <span className="inline-block w-16 text-center border-b border-black border-dotted pb-0.5">{dp.thn}</span>
                             </>
                           );})()}
                        </div>
                        <div>Pukul <span className="inline-block w-20 text-center border-b border-black border-dotted pb-0.5">{selectedRecordForPrint.jam_input}</span> WIB</div>

                        <div className="mt-4">
                          <div className="mb-1">Yang Menerima</div>
                          <div className="grid grid-cols-[80px_10px_1fr] gap-y-1 pl-4">
                            <div>Nama</div><div>:</div><div className="border-b border-black border-dotted w-64 pb-0.5">{penandatangan.pemeriksa}</div>
                            <div>NIP</div><div>:</div><div className="border-b border-black border-dotted w-64 pb-0.5"></div>
                          </div>
                        </div>

                        <div className="mt-8 flex flex-col gap-4">
                           <div className="flex items-center gap-4">
                              <span className="w-48">Telah menerima uang sejumlah Rp.</span>
                              <div className="border-2 border-black bg-slate-50 px-4 py-2 w-64 text-base font-bold tracking-widest text-center box-border">
                                {formatRp(getRowTotal(selectedRecordForPrint))}
                              </div>
                           </div>
                           <div className="flex items-start gap-4">
                              <span className="w-48 pt-3">Terbilang</span>
                              <div className="border border-black bg-slate-50 px-4 py-3 flex-1 max-w-lg min-h-[60px] font-bold text-[13px] italic uppercase box-border flex items-center leading-relaxed">
                                #{terbilang(getRowTotal(selectedRecordForPrint))} RUPIAH#
                              </div>
                           </div>
                        </div>

                        <div className="mt-8">
                          <div className="mb-1">Yang Menyetor</div>
                          <div className="grid grid-cols-[80px_10px_1fr] gap-y-1 pl-4">
                            <div>Nama</div><div>:</div><div className="border-b border-black border-dotted w-64 pb-0.5">{selectedRecordForPrint.nama}</div>
                            <div>NIP</div><div>:</div><div className="border-b border-black border-dotted w-64 pb-0.5"></div>
                          </div>
                        </div>

                      </div>

                      {/* Tanda Tangan Berita Acara */}
                      <div className="mt-14 flex justify-between text-center text-[13px] font-semibold px-6 pb-2">
                        <div className="w-48 flex flex-col">
                           <div className="mb-20 leading-relaxed">Penerima<br/>Petugas Pemeriksa,</div>
                           <div>( <span className="inline-block w-40 border-b border-black border-dotted pb-0.5 text-xs">{penandatangan.pemeriksa}</span> )</div>
                        </div>
                        <div className="w-48 flex flex-col">
                           <div className="mb-20 leading-relaxed">Penyetor<br/>Petugas Loket,</div>
                           <div>( <span className="inline-block w-40 border-b border-black border-dotted pb-0.5 text-xs">{selectedRecordForPrint.nama}</span> )</div>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
