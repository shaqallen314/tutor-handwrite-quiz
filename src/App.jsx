import { useState, useEffect, useCallback, useRef } from 'react';
// 🌟 引入 exportToBlob 處理交卷圖片輸出
import { Tldraw, AssetRecordType, createShapeId, exportToBlob } from 'tldraw';
import 'tldraw/tldraw.css';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

// ==========================================
// 🌟 1. Firebase 與 Cloudinary 設定 (請填寫你的金鑰)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBJBM8LOAPIOOZoJJ0Z5VCYIHu0GLOgaQ0",
    authDomain: "tutor-website-442eb.firebaseapp.com",
    projectId: "tutor-website-442eb",
    storageBucket: "tutor-website-442eb.firebasestorage.app",
    messagingSenderId: "612433420675",
    appId: "1:612433420675:web:e477021e6b7e104e7e16b6"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CLOUD_NAME = "djyt6fh9g"; 
const UPLOAD_PRESET = "zazj8sfj";

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
  return (
    <div style={{
      background: timeLeft <= 60 ? '#fadbd8' : '#ecf0f1',
      color: timeLeft <= 60 ? '#c0392b' : '#2c3e50',
      padding: '8px 15px', borderRadius: '8px',
      fontWeight: 'bold', fontSize: '20px', transition: 'all 0.3s ease'
    }}>
      ⏱️ {`${m}:${s.toString().padStart(2, '0')}`}
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
  const [isUploading, setIsUploading] = useState(false); // 控制上傳中的遮罩
  
  const isSubmittingRef = useRef(false); // 防止重複交卷的鎖

  // 讀取網址參數
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const taskId = searchParams.get('taskId') || 'test-id';
    const student = searchParams.get('student') || '測試學生';
    const pdfUrl = searchParams.get('pdfUrl') || '/test.pdf'; 
    const timeLimit = parseInt(searchParams.get('time')) || 2; 

    setParams({ taskId, student, pdfUrl, initialTime: timeLimit > 0 ? timeLimit * 60 : 120 });
  }, []);

  const handleMount = useCallback((editorInstance) => {
    setEditor(editorInstance);
  }, []);

  // 🌟 功能：自動交卷引擎 (上傳 Cloudinary + 寫入 Firebase)
  const handleAutoSubmit = useCallback(async (message) => {
    if (!editor || isSubmittingRef.current) return;
    
    isSubmittingRef.current = true; // 上鎖，防止重複點擊
    setIsUploading(true); // 顯示上傳遮罩，禁止繼續作答
    setTimeout(() => alert(message), 100);

    try {
      // 取得畫布上所有的圖形 ID
      const shapeIds = Array.from(editor.getCurrentPageShapeIds());
      
      if (shapeIds.length === 0) {
        throw new Error("畫布是空的！");
      }

      // 將畫布匯出成 PNG Blob
      const blob = await exportToBlob({
        editor,
        ids: shapeIds,
        format: 'png',
        opts: { background: true, padding: 20 }
      });

      // 打包並上傳到 Cloudinary
      const formData = new FormData();
      formData.append('file', blob);
      formData.append('upload_preset', UPLOAD_PRESET);

      const cloudinaryRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST', body: formData
      });
      const cloudData = await cloudinaryRes.json();
      
      if (!cloudData.secure_url) throw new Error("圖床上傳失敗");

      // 將成績與圖片網址寫入 Firebase Firestore
      await addDoc(collection(db, "exam_results"), {
        taskId: params.taskId,
        student: params.student,
        imageUrl: cloudData.secure_url,
        submittedAt: new Date(),
        reason: message
      });

      alert("✅ 交卷成功！即將為您跳轉...");
      window.location.href = "https://www.google.com.tw"; // 交卷後踢回首頁 (或你的家教網址)

    } catch (error) {
      console.error("交卷失敗:", error);
      alert(`交卷處理失敗: ${error.message} \n請檢查網路並稍後再試。`);
      isSubmittingRef.current = false;
      setIsUploading(false);
    }
  }, [editor, params]);

  // 🌟 功能：防作弊機制 (偵測跳出視窗)
  useEffect(() => {
    const handleVisibilityChange = () => {
      // 如果畫面被隱藏 (切換分頁/縮小視窗)，且還沒交卷，就強制收卷
      if (document.visibilityState === 'hidden' && editor && !isSubmittingRef.current) {
        handleAutoSubmit("⚠️ 系統偵測到您跳出/切換了作答畫面！已強制收卷。");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [editor, handleAutoSubmit]); 

  // 功能：載入 PDF
  const loadPdfIntoTldraw = async (tldrawEditor, url) => {
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
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const myAssetId = AssetRecordType.createId();
      const myShapeId = createShapeId();

      tldrawEditor.createAssets([{
        id: myAssetId, type: 'image', typeName: 'asset',
        props: { 
          w: canvas.width, h: canvas.height, 
          name: 'exam-paper', isAnimated: false, 
          mimeType: 'image/jpeg', src: dataUrl 
        },
        meta: {}, 
      }]);

      tldrawEditor.createShapes([{
        id: myShapeId, type: 'image', x: 0, y: 0, isLocked: true,
        props: { assetId: myAssetId, w: canvas.width, h: canvas.height }, 
        meta: {}, 
      }]);

      setTimeout(() => tldrawEditor.zoomToFit(), 200);

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
      
      {/* 🌟 上傳中遮罩 (阻止學生繼續畫圖) */}
      {isUploading && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.9)',
          zIndex: 99999, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center',
          fontSize: '24px', fontWeight: 'bold', color: '#27ae60'
        }}>
          <div style={{ marginBottom: '20px', fontSize: '40px' }}>🚀</div>
          考卷處理與上傳中，請勿關閉網頁...
        </div>
      )}

      {/* 頂部工具列 */}
      {params.initialTime > 0 && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '60px',
          background: '#ffffff', borderBottom: '2px solid #ecf0f1',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0 20px', fontFamily: 'sans-serif', zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <CountdownTimer 
              initialTime={params.initialTime} 
              onTimeUp={() => handleAutoSubmit("⏰ 時間到！系統已自動收卷。")} 
            />
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
      )}

      {/* 畫布本體 */}
      <div style={{ position: 'absolute', top: params.initialTime > 0 ? '60px' : 0, bottom: 0, left: 0, right: 0 }}>
        {isLoadingPdf && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)',
            zIndex: 10, display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontSize: '24px', fontWeight: 'bold', color: '#2c3e50'
          }}>
            🔄 考卷解析與載入中...
          </div>
        )}
        <Tldraw onMount={handleMount} />
      </div>
    </div>
  );
}