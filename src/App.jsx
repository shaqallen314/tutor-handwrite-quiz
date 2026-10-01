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

const CLOUD_NAME = "你的cloud_name"; 
const UPLOAD_PRESET = "你的upload_preset";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.mjs`;

// ==========================================
// 🌟 2. 獨立的計時器元件 (完美隔離重新渲染)
// ==========================================
const CountdownTimer = ({ initialTime, onTimeUp }) => {
  const [timeLeft, setTimeLeft] = useState(initialTime);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timerId = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerId);
          onTimeUp(); // 觸發交卷
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
// 🌟 3. 主應用程式 (現在只會渲染一次，畫布不再崩潰！)
// ==========================================
export default function App() {
  const [params, setParams] = useState({ taskId: '', student: '', pdfUrl: '', initialTime: 0 });
  const [editor, setEditor] = useState(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const isSubmittingRef = useRef(false);

  // 1. 初始化讀取網址參數
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const taskId = searchParams.get('taskId') || 'test-id';
    const student = searchParams.get('student') || '測試學生';
    const pdfUrl = searchParams.get('pdfUrl') || '/test.pdf'; 
    const timeLimit = parseInt(searchParams.get('time')) || 0; 

    setParams({ 
      taskId, 
      student, 
      pdfUrl, 
      initialTime: timeLimit > 0 ? timeLimit * 60 : 120 
    });
  }, []);

  // 2. 防作弊機制
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && editor && !isSubmittingRef.current) {
        handleAutoSubmit("⚠️ 系統偵測到您跳出/切換了作答畫面！已強制收卷。");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [editor]); 

  // 3. 自動交卷引擎 (使用 useCallback 防止函數一直重建)
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

  // 4. PDF 載入引擎
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
      
      tldrawEditor.createAssets([{
        id: AssetRecordType.createId(), type: 'image', typeName: 'asset',
        props: { w: canvas.width, h: canvas.height, name: 'exam-paper', isAnimated: false, mimeType: 'image/jpeg', src: canvas.toDataURL('image/jpeg', 0.9) },
        meta: {}, 
      }]);

      tldrawEditor.createShapes([{
        id: createShapeId(), type: 'image', x: 0, y: 0, isLocked: true,
        props: { assetId: AssetRecordType.createId(), w: canvas.width, h: canvas.height }, // 故意重複取 id 但已宣告所以沒問題
        meta: {}, 
      }]);

      tldrawEditor.zoomToFit({ duration: 500 });
      tldrawEditor.setCurrentTool('draw');

    } catch (err) {
      console.error("PDF 載入失敗:", err);
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
          
          {/* 🌟 只有這裡會每秒更新，畫布不再受影響 */}
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