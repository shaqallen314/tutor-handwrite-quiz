import { useState, useEffect, useRef } from 'react';
import { Tldraw, AssetRecordType, createShapeId } from 'tldraw';
import 'tldraw/tldraw.css';

// 引入 Firebase 工具
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

export default function App() {
  // 🌟 核心修正：直接在 useState 裡解析網址參數，避免多次 setState 造成畫面重建
  const [params] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const taskId = searchParams.get('taskId') || 'test-id';
    const student = searchParams.get('student') || '測試學生';
    const pdfUrl = searchParams.get('pdfUrl') || '/test.pdf'; 
    const timeLimit = parseInt(searchParams.get('time')) || 2; // 預設 2 分鐘
    return { taskId, student, pdfUrl, timeLimit };
  });

  // 🌟 讓倒數計時一開始就有正確的值，不再經歷 null -> 數字 的二次渲染
  const [timeLeft, setTimeLeft] = useState(params.timeLimit * 60);
  
  const [editor, setEditor] = useState(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  
  const [isUploading, setIsUploading] = useState(false);
  const isSubmittingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  // 防作弊偵測
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && editor && !isSubmittingRef.current) {
        handleAutoSubmit("⚠️ 系統偵測到您跳出/切換了作答畫面！已強制收卷。");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [editor]);

  // 倒數計時器
  useEffect(() => {
    if (timeLeft <= 0 || isSubmittingRef.current) return;
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
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // 交卷引擎
  const handleAutoSubmit = async (message) => {
    if (!editor) return;
    if (isSubmittingRef.current) return;
    
    isSubmittingRef.current = true;
    setIsUploading(true);

    setTimeout(() => alert(message), 100);

    try {
      const shapes = editor.getCurrentPageShapes();
      const { blob } = await editor.toImage(shapes, { format: 'png', background: true, padding: 20 });

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

      await addDoc(collection(db, "exam_results"), {
        taskId: params.taskId,
        student: params.student,
        imageUrl: imageUrl,
        submittedAt: new Date(),
        reason: message
      });

      alert("✅ 交卷成功！即將返回...");
      window.location.href = "https://www.google.com.tw"; 

    } catch (error) {
      console.error("交卷流程失敗:", error);
      alert("交卷處理失敗，請聯繫老師。");
      isSubmittingRef.current = false;
      setIsUploading(false);
    }
  };

  // PDF 載入函數
  const loadPdfIntoTldraw = async (tldrawEditor, url) => {
    if (!url || hasLoadedRef.current) return; 
    hasLoadedRef.current = true; 
    setIsLoadingPdf(true);
    
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.mjs`;

      const loadingTask = pdfjsLib.getDocument({ url: url });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1); 
      
      const viewport = page.getViewport({ scale: 1.5 }); 
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
      hasLoadedRef.current = false; 
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