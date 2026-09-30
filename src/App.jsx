import { useState, useEffect, useRef } from 'react';
import { Tldraw, AssetRecordType, createShapeId } from 'tldraw';
import 'tldraw/tldraw.css';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// 🌟 引入 Firebase 工具
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

// ==========================================
// 🌟 1. 請在這裡填入你的 Firebase 設定
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBJBM8LOAPIOOZoJJ0Z5VCYIHu0GLOgaQ0",
    authDomain: "tutor-website-442eb.firebaseapp.com",
    projectId: "tutor-website-442eb",
    storageBucket: "tutor-website-442eb.firebasestorage.app",
    messagingSenderId: "612433420675",
    appId: "1:612433420675:web:e477021e6b7e104e7e16b6"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// 🌟 2. 請在這裡填入你的 Cloudinary 設定
// ==========================================
const CLOUD_NAME = "djyt6fh9g"; 
const UPLOAD_PRESET = "zazj8sfj"; // 記得要設定為 Unsigned

// PDF 引擎設定
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.mjs`;

export default function App() {
  const [params, setParams] = useState({ taskId: '', student: '', pdfUrl: '' });
  const [timeLeft, setTimeLeft] = useState(null);
  const [editor, setEditor] = useState(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  
  // 🌟 上傳狀態鎖 (防止防作弊、時間到、手動按鈕 發生重複交卷)
  const [isUploading, setIsUploading] = useState(false);
  const isSubmittingRef = useRef(false); 

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const taskId = searchParams.get('taskId') || 'test-id';
    const student = searchParams.get('student') || '測試學生';
    const pdfUrl = searchParams.get('pdfUrl') || '/test.pdf'; 
    const timeLimit = parseInt(searchParams.get('time')) || 0; 

    setParams({ taskId, student, pdfUrl });
    if (timeLimit > 0) setTimeLeft(timeLimit * 60);
    else setTimeLeft(120); 
  }, []);

  // ==========================================
  // 🌟 新增：防作弊偵測 (跳出畫面即交卷)
  // ==========================================
  useEffect(() => {
    const handleVisibilityChange = () => {
      // 當網頁變成隱藏狀態，且編輯器已載入，且還沒開始交卷時
      if (document.visibilityState === 'hidden' && editor && !isSubmittingRef.current) {
        handleAutoSubmit("⚠️ 系統偵測到您跳出/切換了作答畫面！已強制收卷。");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [editor]); // 依賴 editor 來確保有截圖目標

  // 倒數計時器
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || isSubmittingRef.current) return;
    const timerId = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerId);
          handleAutoSubmit("⏰ 時間到！系統已自動收卷。");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerId);
  }, [timeLeft]);

  const formatTime = (seconds) => {
    if (seconds === null) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ==========================================
  // 🌟 最終版交卷引擎：截圖 -> Cloudinary -> Firebase
  // ==========================================
  const handleAutoSubmit = async (message) => {
    if (!editor) return;
    if (isSubmittingRef.current) return; // 鎖住，防止重複觸發
    
    // 上鎖並顯示 Loading 畫面
    isSubmittingRef.current = true;
    setIsUploading(true);

    // 延遲一點點 alert，讓 UI 上的 isUploading 可以先渲染出來
    setTimeout(() => alert(message), 100);

    try {
      // 1. 取得畫布形狀並壓扁成圖片
      const shapes = editor.getCurrentPageShapes();
      const { blob } = await editor.toImage(shapes, { format: 'png', background: true, padding: 20 });

      // 2. 上傳到 Cloudinary
      const formData = new FormData();
      formData.append('file', blob);
      formData.append('upload_preset', UPLOAD_PRESET);

      const cloudinaryRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
      });
      const cloudData = await cloudinaryRes.json();
      
      if (!cloudData.secure_url) throw new Error("Cloudinary 上傳失敗");
      const imageUrl = cloudData.secure_url;

      // 3. 將圖片網址與考生資訊寫入 Firebase (存入 'exam_results' 集合中)
      await addDoc(collection(db, "exam_results"), {
        taskId: params.taskId,
        student: params.student,
        imageUrl: imageUrl,
        submittedAt: new Date(),
        reason: message // 記錄交卷原因 (可讓老師知道學生是不是作弊被抓)
      });

      console.log("資料庫寫入成功！");
      alert("✅ 交卷成功！即將返回首頁...");
      
      // 4. 交卷完成後，強制把學生踢回你的家教平台主網站 (請改為你的實際網址)
      window.location.href = "https://www.google.com.tw"; 

    } catch (error) {
      console.error("交卷流程失敗:", error);
      alert("交卷處理失敗，請聯繫老師或稍後再試。");
      
      // 如果失敗了，解開鎖讓學生可以重新按鈕上傳
      isSubmittingRef.current = false;
      setIsUploading(false);
    }
  };

  const loadPdfIntoTldraw = async (tldrawEditor, url) => {
    if (!url) return;
    setIsLoadingPdf(true);
    
    try {
      const loadingTask = pdfjsLib.getDocument({ url: url });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1); 
      
      const viewport = page.getViewport({ scale: 2.5 }); 
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

      const assetId = AssetRecordType.createId();
      const shapeId = createShapeId();

      tldrawEditor.createAssets([{
        id: assetId, type: 'image', typeName: 'asset',
        props: { w: canvas.width, h: canvas.height, name: 'exam-paper', isAnimated: false, mimeType: 'image/jpeg', src: dataUrl },
        meta: {}, 
      }]);

      tldrawEditor.createShapes([{
        id: shapeId, type: 'image', x: 0, y: 0, isLocked: true,
        props: { assetId: assetId, w: canvas.width, h: canvas.height },
        meta: {}, 
      }]);

      tldrawEditor.zoomToFit({ duration: 500 });
      tldrawEditor.setCurrentTool('draw');

    } catch (err) {
      console.error("PDF 載入失敗:", err);
      alert("考卷載入失敗：" + err.message);
    } finally {
      setIsLoadingPdf(false);
    }
  };

useEffect(() => {
    if (editor && params.pdfUrl) {
      loadPdfIntoTldraw(editor, params.pdfUrl);
    }
  }, [editor, params.pdfUrl]);

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      
      {/* 若正在上傳交卷中，蓋住整個畫面防止再操作 */}
      {isUploading && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.9)',
          zIndex: 99999, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center',
          fontSize: '24px', fontWeight: 'bold', color: '#27ae60'
        }}>
          <div style={{ marginBottom: '20px', fontSize: '40px' }}>🚀</div>
          考卷上傳中，請勿關閉網頁...
        </div>
      )}

      {/* 頂部儀表板 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '60px',
        background: '#ffffff', borderBottom: '2px solid #ecf0f1',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 20px', fontFamily: 'sans-serif', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{
            background: timeLeft <= 60 ? '#fadbd8' : '#ecf0f1',
            color: timeLeft <= 60 ? '#c0392b' : '#2c3e50',
            padding: '8px 15px', borderRadius: '8px',
            fontWeight: 'bold', fontSize: '20px', transition: 'all 0.3s ease'
          }}>
            ⏱️ {formatTime(timeLeft)}
          </div>
          <span style={{ color: '#7f8c8d', fontSize: '15px', fontWeight: 'bold' }}>
            🧑‍🎓 考生：{params.student}
          </span>
        </div>
        
        <button 
          onClick={() => handleAutoSubmit("確定要提前交卷嗎？")}
          style={{
            background: '#27ae60', color: 'white', border: 'none',
            padding: '10px 20px', borderRadius: '8px',
            fontWeight: 'bold', fontSize: '16px', cursor: 'pointer',
            boxShadow: '0 4px 6px rgba(39, 174, 96, 0.2)'
          }}
        >
          提前交卷
        </button>
      </div>

      {/* tldraw 畫布本體 */}
      <div style={{ position: 'absolute', top: '60px', bottom: 0, left: 0, right: 0 }}>
        {isLoadingPdf && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)',
            zIndex: 5, display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontSize: '20px', fontWeight: 'bold', color: '#2c3e50'
          }}>
            🔄 考卷解析與載入中...
          </div>
        )}
        <Tldraw onMount={(editorInstance) => setEditor(editorInstance)} />
      </div>
    </div>
  );
}