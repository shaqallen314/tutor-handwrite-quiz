import { useState, useEffect, useRef, useCallback } from 'react';
import { Tldraw, AssetRecordType, createShapeId } from 'tldraw';
import 'tldraw/tldraw.css';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

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

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.mjs`;

// ==========================================
// 🌟 2. 獨立的計時器元件
// ==========================================
const CountdownTimer = ({ initialTime, onTimeUp }) => {
  const [timeLeft, setTimeLeft] = useState(initialTime);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timerId = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerId);
          onTimeUp(); 
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerId);
  }, [timeLeft, onTimeUp]);

  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  const timeString = `${m}:${s.toString().padStart(2, '0')}`;

  return (
    <div style={{
      background: timeLeft <= 60 ? '#fadbd8' : '#ecf0f1',
      color: timeLeft <= 60 ? '#c0392b' : '#2c3e50',
      padding: '8px 15px', borderRadius: '8px',
      fontWeight: 'bold', fontSize: '20px', transition: 'all 0.3s ease'
    }}>
      ⏱️ {timeString}
    </div>
  );
};


// ==========================================
// 🌟 3. 主應用程式
// ==========================================
export default function App() {
  const [params, setParams] = useState({ taskId: '', student: '', pdfUrl: '', initialTime: 0 });
  const [editor, setEditor] = useState(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const isSubmittingRef = useRef(false);
  const isPdfLoadedRef = useRef(false); // 🌟 防護鎖 1：防止 React 重複載入 PDF

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const taskId = searchParams.get('taskId') || 'test-id';
    const student = searchParams.get('student') || '測試學生';
    const pdfUrl = searchParams.get('pdfUrl') || '/test.pdf'; 
    const timeLimit = parseInt(searchParams.get('time')) || 0; 

    setParams({ taskId, student, pdfUrl, initialTime: timeLimit > 0 ? timeLimit * 60 : 120 });
  }, []);

  const handleMount = useCallback((editorInstance) => {
    setEditor(editorInstance);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && editor && !isSubmittingRef.current) {
        handleAutoSubmit("⚠️ 系統偵測到您跳出/切換了作答畫面！已強制收卷。");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [editor]); 

  const handleAutoSubmit = useCallback(async (message) => {
    if (!editor || isSubmittingRef.current) return;
    
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
        method: 'POST', body: formData
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

      alert("✅ 交卷成功！即將返回首頁...");
      window.location.href = "https://www.google.com.tw"; 

    } catch (error) {
      console.error("交卷失敗:", error);
      alert("交卷處理失敗，請稍後再試。");
      isSubmittingRef.current = false;
      setIsUploading(false);
    }
  }, [editor, params]);

  const loadPdfIntoTldraw = async (tldrawEditor, url) => {
    if (!url) return;
    setIsLoadingPdf(true);
    try {
      const loadingTask = pdfjsLib.getDocument({ url: url });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1); 
      
      const viewport = page.getViewport({ scale: 1.5 }); 
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({ canvasContext: ctx, viewport }).promise;
      
      const myAssetId = AssetRecordType.createId();
      const myShapeId = createShapeId();

      tldrawEditor.createAssets([{
        id: myAssetId, type: 'image', typeName: 'asset',
        props: { w: canvas.width, h: canvas.height, name: 'exam-paper', isAnimated: false, mimeType: 'image/jpeg', src: canvas.toDataURL('image/jpeg', 0.9) },
        meta: {}, 
      }]);

      tldrawEditor.createShapes([{
        id: myShapeId, type: 'image', x: 0, y: 0, isLocked: true,
        props: { assetId: myAssetId, w: canvas.width, h: canvas.height }, 
        meta: {}, 
      }]);

      // 🌟 防護鎖 2：強制延遲 0.2 秒，讓引擎有時間計算圖片體積，避免攝影機 NaN 當機
      setTimeout(() => {
        try {
          tldrawEditor.zoomToFit();
          tldrawEditor.setCurrentTool('draw');
        } catch (e) {
          console.error("縮放視角失敗", e);
        }
      }, 200);

    } catch (err) {
      console.error("PDF 載入失敗:", err);
    } finally {
      setIsLoadingPdf(false);
    }
  };

  useEffect(() => {
    // 🌟 檢查防護鎖，確保 PDF 絕對只會被載入一次
    if (editor && params.pdfUrl && !isPdfLoadedRef.current) {
      isPdfLoadedRef.current = true;
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

      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '60px',
        background: '#ffffff', borderBottom: '2px solid #ecf0f1',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 20px', fontFamily: 'sans-serif', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {params.initialTime > 0 && (
            <CountdownTimer 
              initialTime={params.initialTime} 
              onTimeUp={() => handleAutoSubmit("⏰ 時間到！系統已自動收卷。")} 
            />
          )}
          <span style={{ color: '#7f8c8d', fontSize: '15px', fontWeight: 'bold' }}>
            🧑‍🎓 {params.student}
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
        <Tldraw onMount={handleMount} />
      </div>
    </div>
  );
}