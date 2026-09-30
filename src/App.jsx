import { useState, useEffect, useRef, Component } from 'react';
import { Tldraw, AssetRecordType, createShapeId } from 'tldraw';
import 'tldraw/tldraw.css';

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

// 🌟 內建錯誤攔截雷達 (ErrorBoundary)
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '30px', background: '#ffebee', color: '#c62828', height: '100vh', overflow: 'auto', fontFamily: 'monospace' }}>
          <h2>💥 抓到系統崩潰原因 (Crash Error)</h2>
          <h3>{this.state.error && this.state.error.toString()}</h3>
          <pre style={{ background: '#fff', padding: '15px', border: '1px solid #ef9a9a' }}>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const [params] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const taskId = searchParams.get('taskId') || 'test-id';
    const student = searchParams.get('student') || '測試學生';
    const pdfUrl = searchParams.get('pdfUrl') || '/test.pdf'; 
    const timeLimit = parseInt(searchParams.get('time')) || 2;
    return { taskId, student, pdfUrl, timeLimit };
  });

  const [timeLeft, setTimeLeft] = useState(params.timeLimit * 60);
  const [editor, setEditor] = useState(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  
  const [isUploading, setIsUploading] = useState(false);
  const isSubmittingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && editor && !isSubmittingRef.current) {
        handleAutoSubmit("⚠️ 系統偵測到您跳出/切換了作答畫面！已強制收卷。");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [editor]);

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

      await addDoc(collection(db, "exam_results"), {
        taskId: params.taskId,
        student: params.student,
        imageUrl: cloudData.secure_url,
        submittedAt: new Date(),
        reason: message
      });

      alert("✅ 交卷成功！");
      window.location.href = "https://www.google.com.tw"; 
    } catch (error) {
      console.error("交卷流程失敗:", error);
      alert("交卷處理失敗：" + error.message);
      isSubmittingRef.current = false;
      setIsUploading(false);
    }
  };

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
          justifyContent: 'center', alignItems: 'center', fontSize: '24px', fontWeight: 'bold', color: '#27ae60'
        }}>
          🚀 考卷上傳中，請勿關閉網頁...
        </div>
      )}

      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '60px',
        background: '#ffffff', borderBottom: '2px solid #ecf0f1',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 20px', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: '#ecf0f1', padding: '8px 15px', borderRadius: '8px', fontWeight: 'bold', fontSize: '20px' }}>
            ⏱️ {formatTime(timeLeft)}
          </div>
          <span>🧑‍🎓 考生：{params.student}</span>
        </div>
        <button onClick={() => handleAutoSubmit("確定要提前交卷嗎？")} style={{ background: '#27ae60', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
          提前交卷
        </button>
      </div>

      <div style={{ position: 'absolute', top: '60px', bottom: 0, left: 0, right: 0 }}>
        {isLoadingPdf && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', zIndex: 5, display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>
            🔄 考卷解析與載入中...
          </div>
        )}
        <Tldraw onMount={(editorInstance) => setEditor(editorInstance)} />
      </div>
    </div>
  );
}