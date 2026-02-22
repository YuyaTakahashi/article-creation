function doPost(e) {
  // 1. JSONデータをパース
  const jsonString = e.postData.contents;
  const data = JSON.parse(jsonString);
  
  // 2. プロパティ取得
  const props = PropertiesService.getScriptProperties();
  const WP_SITE_URL = props.getProperty('WP_SITE_URL');
  const WP_USER     = props.getProperty('WP_USER');
  const WP_APP_PASS = props.getProperty('WP_APP_PASS');
  const POST_TYPE   = props.getProperty('POST_TYPE') || 'posts';

  const authHeader = 'Basic ' + Utilities.base64Encode(WP_USER + ':' + WP_APP_PASS);

  // 3. アクション分岐
  if (data.action === 'search') {
    return handleBatchSearch(data, WP_SITE_URL, authHeader, POST_TYPE);
    
  } else if (data.action === 'post') { 
    return handlePost(data, WP_SITE_URL, authHeader, POST_TYPE);
    
  } else if (data.action === 'upload_media') { 
    // ★★★ これを追加！画像単体アップロード用 ★★★
    return handleMediaUploadOnly(data, WP_SITE_URL, authHeader);
    
  } else if (data.action === 'delete') {
    return handleDelete(data, WP_SITE_URL, authHeader, POST_TYPE);
    
  } else {
    return createResponse(400, "Invalid Action");
  }
}

// ==========================================
// A. 一括検索機能 (Map対応版: 表記ゆれ吸収 & 原語紐付け)
// ==========================================
function handleBatchSearch(data, siteUrl, auth, postType) {
  // Map形式を受け取る想定: { "スマホ": ["スマホ", "スマートフォン"], "UX": ["UX"] }
  let keywordsMap = data.keywords || {};
  
  // ★追加：Difyから「単なる文字列（String）」として送られてきた場合、パースしてオブジェクトに戻す
  if (typeof keywordsMap === 'string') {
    try {
      // LLMが余計に付けた ```json と ``` を取り除く
      const cleanString = keywordsMap.replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      keywordsMap = JSON.parse(cleanString);
    } catch (e) {
      return createResponse(400, "JSONパースエラー: 文字列を変換できませんでした");
    }
  }

  // もし配列で来ちゃったら、Mapに変換してあげる（優しさ設計）
  if (Array.isArray(keywordsMap)) {
    let tempMap = {};
    keywordsMap.forEach(k => tempMap[k] = [k]);
    keywordsMap = tempMap;
  }

  const terms = Object.keys(keywordsMap);
  if (terms.length === 0) {
    return createResponse(400, "キーワードがありません");
  }

  let foundList = []; // 結果リスト

  // 1. 各「元の単語」ごとにループ
  terms.forEach(originalTerm => {
    let candidates = keywordsMap[originalTerm];
    if (!Array.isArray(candidates)) candidates = [candidates];

    let foundUrl = null;

    // 2. 候補（シノニム）を順番に検索
    // ※ ループ内で return して脱出するために for...of を使用
    for (const searchWord of candidates) {
      if (!searchWord) continue;

      try {
        // 検索実行 (10件取得)
        const endpoint = `${siteUrl}/wp-json/wp/v2/${postType}?search=${encodeURIComponent(searchWord)}&per_page=10&_fields=title,link,slug`;
        const options = {
            'method' : 'get',
            'headers': { 
                'Authorization': auth,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            'muteHttpExceptions': true
        };

        const response = UrlFetchApp.fetch(endpoint, options);
        if (response.getResponseCode() === 200) {
          const results = JSON.parse(response.getContentText());
          
          if (results.length > 0) {
             // 正規化
             const normalize = (str) => str.toString().toLowerCase().trim().replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
             const targetCheck = normalize(searchWord);

             // 一致チェック（完全一致、またはタイトル/スラッグに検索語が含まれるか）
             const match = results.find(article => {
                const t = normalize(article.title.rendered || article.title.raw);
                const s = normalize(article.slug);
                return t === targetCheck || s === targetCheck || t.includes(targetCheck) || s.includes(targetCheck);
             });

             if (match) {
               foundUrl = match.link;
               break; // ★ヒットしたら、この単語(originalTerm)の検索は終了！次へ！
             }
          }
        }
      } catch (e) {
        console.log(`Error: ${e.toString()}`);
      }
      Utilities.sleep(50); // API制限除け
    }

    // 3. ヒットしていれば結果に追加
    if (foundUrl) {
      foundList.push({
        term: originalTerm, // 記事中の元の単語
        url: foundUrl
      });
    }
  });

  // 結果テキスト作成: "元の単語: URL"
  const resultText = foundList.map(item => `${item.term}: ${item.url}`).join('\n');

  return createResponse(200, "Batch Search Success", {
    input_count: terms.length,
    found_count: foundList.length,
    result_text: resultText,
    result_list: foundList 
  });
}

// ==========================================
// C. 記事投稿機能 (Markdown変換対応版)
// ==========================================
function handlePost(data, siteUrl, auth, postType) {
  log("Action: handlePost started.");

  if (!data.title || !data.content) {
    log("Error: Missing title or content");
    return createResponse(400, "Missing title or content");
  }

  // 画像処理（ここは変更なし）
  let featuredMediaId = 0;
  if (data.imageUrl) {
    // ... (画像処理のコードはそのまま) ...
    // 長くなるので省略しますが、既存の画像処理ロジックをそのまま維持してください
    // もし不安なら、前の「完全版」コードのこの部分をコピペしてください
    
    // ↓↓↓ ここだけ簡易的に書きます（実際は前のコードを使ってください）
    let fileName = data.fileName || 'image.jpg';
    const uploadResult = uploadImageToWordPress(data.imageUrl, fileName, siteUrl, auth);
    if (uploadResult && uploadResult.id) featuredMediaId = uploadResult.id;
  }

  // ★★★ ここが修正ポイント！ ★★★
  // data.content をそのまま渡さず、convertMarkdownToHtml() に通します
  const htmlContent = convertMarkdownToHtml(data.content);

  const payload = {
    title: data.title,
    content: htmlContent, // 変換後のHTMLを入れる
    status: 'draft',
    slug: data.slug || '',
    excerpt: data.excerpt || '',  // ★★★ この1行を追加！ ★★★
    featured_media: featuredMediaId
  };


  if (data.categoryIds) {
    if (Array.isArray(data.categoryIds)) {
      payload.categories = data.categoryIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    } else {
      const parsedId = parseInt(data.categoryIds, 10);
      if (!isNaN(parsedId)) {
        payload.categories = [parsedId];
      }
    }
  }

  const endpoint = `${siteUrl}/wp-json/wp/v2/${postType}`;
  
  // ... (以下、送信処理はそのまま) ...
  const options = {
    'method': 'post',
    'headers': {
      'Authorization': auth,
      'Content-Type': 'application/json'
    },
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };

    try {
    const response = UrlFetchApp.fetch(endpoint, options);
    const result = JSON.parse(response.getContentText());
    
    // ★追加（修正版）: siteUrlをそのまま使って管理画面URLを組み立てる (サブディレクトリ対応)
    if (result && result.id) {
      // WordPressの編集画面URL（クラシックエディタ指定）
      // 例: https://uxdaystokyo.com/articles/wp-admin/post.php?post=37795&action=edit&classic-editor__forget&classic-editor
      result.editUrl = `${siteUrl}/wp-admin/post.php?post=${result.id}&action=edit&classic-editor__forget&classic-editor`;
    }
    // ★ここで古いファイルを自動削除（1ヶ月以上前）
    deleteOldFilesInFolder();

    return createResponse(200, "Post Created", result);
  } catch (e) {
    return createResponse(500, "Error: " + e.toString());
  }

}

// ==========================================
// E. 削除機能 (WordPress記事 & Google Driveドキュメント連携削除)
// ==========================================
function handleDelete(data, siteUrl, auth, postType) {
  let wpDeleted = false;
  let docDeleted = false;
  let errors = [];

  // 1. WordPress記事の削除 (wpLink から Post ID を抽出)
  if (data.wpLink) {
    try {
      // URLからのPost ID抽出 (例: .../wp-admin/post.php?post=37795&action=edit...)
      const match = data.wpLink.match(/[?&]post=(\d+)/);
      const postId = match ? match[1] : null;

      if (postId) {
        // WordPress REST API GET (to check status first)
        const getEndpoint = `${siteUrl}/wp-json/wp/v2/${postType}/${postId}?_fields=status`;
        const getOptions = {
          'method': 'get',
          'headers': {
            'Authorization': auth,
          },
          'muteHttpExceptions': true
        };
        const getResponse = UrlFetchApp.fetch(getEndpoint, getOptions);
        
        if (getResponse.getResponseCode() === 200) {
           const postData = JSON.parse(getResponse.getContentText());
           if (postData.status === 'publish' || postData.status !== 'draft') {
              errors.push(`WordPress post is not a draft (status: ${postData.status}). Did not delete.`);
           } else {
             // It's a draft, proceed with deletion (soft delete / trash)
             const deleteEndpoint = `${siteUrl}/wp-json/wp/v2/${postType}/${postId}`;
             const deleteOptions = {
               'method': 'delete',
               'headers': {
                 'Authorization': auth,
               },
               'muteHttpExceptions': true
             };
             const deleteResponse = UrlFetchApp.fetch(deleteEndpoint, deleteOptions);
             if (deleteResponse.getResponseCode() === 200 || deleteResponse.getResponseCode() === 201) {
                wpDeleted = true;
             } else {
                errors.push(`WordPress Delete Failed: ${deleteResponse.getContentText()}`);
             }
           }
        } else {
           // Not found or error
           errors.push(`WordPress Get Failed or Post Not Found: ${getResponse.getContentText()}`);
        }
      }
    } catch (e) {
       errors.push("WordPress Delete Error: " + e.toString());
    }
  }

  // 2. Google Docsの削除 (docUrl がフロントから渡された場合)
  // （もしDifyがDocsのURLも出力していてフロントでパースできた場合）
  if (data.docUrl) {
    try {
      const docMatch = data.docUrl.match(/\/d\/(.*?)\//);
      const docId = docMatch ? docMatch[1] : null;
      if (docId) {
        DriveApp.getFileById(docId).setTrashed(true);
        docDeleted = true;
      }
    } catch (e) {
        errors.push("Google Docs Delete Error: " + e.toString());
    }
  }

  return createResponse(200, "Delete Attempted", { wpDeleted, docDeleted, errors });
}

// ==========================================
// ヘルパー関数群
// ==========================================

function convertMarkdownToHtml(markdown) {
  if (!markdown) return "";
  const lines = markdown.split('\n');
  let html = '';
  let inList = false;

  lines.forEach(line => {
    // リスト処理
    const listMatch = line.match(/^-\s+(.*)/);
    if (listMatch) {
      if (!inList) { html += '<ul>\n'; inList = true; }
      html += `  <li>${listMatch[1]}</li>\n`;
    } else {
      if (inList) { html += '</ul>\n'; inList = false; }
      let l = line;
      // 見出し処理
      if (l.match(/^### (.*)/)) l = l.replace(/^### (.*)/, '<h3>$1</h3>');
      else if (l.match(/^## (.*)/)) l = l.replace(/^## (.*)/, '<h2>$1</h2>');
      else if (l.match(/^# (.*)/)) l = l.replace(/^# (.*)/, '<h1>$1</h1>');
      else if (l.trim() !== '') l += '<br>'; // 改行
      
      html += l + '\n';
    }
  });
  if (inList) html += '</ul>\n';

  // 太字変換
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // リンク変換
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');

  // ★★★ 修正箇所: ルビ変換 (英単語¥ヨミ¥ 形式) ★★★
  // 直前の英数字の塊をターゲットにしてルビを振ります
  // 例: "Multimodal¥マルチモーダル¥" → <ruby>Multimodal<rt>マルチモーダル</rt></ruby>
  html = html.replace(/([a-zA-Z0-9]+)¥(.*?)¥/g, '<ruby>$1<rt>$2</rt></ruby>');

  return html;
}

function createResponse(code, message, data) {
  const output = { statusCode: code, message: message, data: data || null };
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// C. テスト実行用 (修正版)
// ==========================================
function testBatchSearch() {
  const mockData = {
    keywords: ["UX", "NPS", "マルチモーダル", "存在しない用語テスト"] 
  };

  const props = PropertiesService.getScriptProperties();
  const WP_SITE_URL = props.getProperty('WP_SITE_URL');
  const WP_USER     = props.getProperty('WP_USER');
  const WP_APP_PASS = props.getProperty('WP_APP_PASS');
  const POST_TYPE   = props.getProperty('POST_TYPE') || 'glossary';

  if (!WP_SITE_URL || !WP_USER || !WP_APP_PASS) {
    console.error("エラー: スクリプトプロパティが設定されていません。");
    return;
  }

  const authHeader = 'Basic ' + Utilities.base64Encode(WP_USER + ':' + WP_APP_PASS);

  console.log("=== テスト検索を開始します ===");
  console.log("検索ワード:", mockData.keywords);

  const response = handleBatchSearch(mockData, WP_SITE_URL, authHeader, POST_TYPE);

  // ★ここを修正しました (getContentText -> getContent)
  const jsonString = response.getContent(); 
  const result = JSON.parse(jsonString);

  console.log("=== 実行結果 ===");
  console.log("ステータスコード:", result.statusCode);
  console.log("メッセージ:", result.message);
  
  if (result.data) {
    console.log("ヒット数:", result.data.found_count);
    console.log("--- result_text ---");
    console.log(result.data.result_text);
    console.log("-------------------");
    console.log("詳細データ:", JSON.stringify(result.data.result_list, null, 2));
  } else {
    console.log("データがありません。");
  }
}

/**
 * 画像をWordPressにアップロードし、キャプションと代替テキストを設定する
 * @param {string} imageUrl 画像のURL
 * @param {string} fileName ファイル名
 * @param {string} siteUrl WordPressサイトのURL
 * @param {string} auth 認証ヘッダー
 * @param {string} caption キャプション・代替テキスト（新規追加）
 */
function uploadImageToWordPress(imageUrl, fileName, siteUrl, auth, caption) {
  if (!imageUrl) return null;

  try {
    // 1. 画像データをWebからダウンロード
    const downloadOptions = {
      'muteHttpExceptions': true,
      'headers': {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };

    const imageResponse = UrlFetchApp.fetch(imageUrl, downloadOptions);
    if (imageResponse.getResponseCode() !== 200) {
      console.log(`画像のダウンロード失敗 (${imageResponse.getResponseCode()}): ${imageUrl}`);
      return null;
    }
    
    const blob = imageResponse.getBlob().setName(fileName);

    // 2. WordPressへアップロード
    const endpoint = `${siteUrl}/wp-json/wp/v2/media`;
    const uploadOptions = {
      'method': 'post',
      'headers': {
        'Authorization': auth,
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
      'contentType': blob.getContentType(),
      'payload': blob,
      'muteHttpExceptions': true
    };

    const uploadResponse = UrlFetchApp.fetch(endpoint, uploadOptions);
    const result = JSON.parse(uploadResponse.getContentText());

    if (uploadResponse.getResponseCode() === 201) {
      const mediaId = result.id;

      // 3. ★新規追加：アップロードした画像にキャプションとAltテキストを設定する
      if (caption) {
        const updateEndpoint = `${endpoint}/${mediaId}`;
        const updateOptions = {
          'method': 'post',
          'headers': {
            'Authorization': auth,
            'Content-Type': 'application/json'
          },
          'payload': JSON.stringify({
            'caption': caption,   // キャプション
            'alt_text': caption,  // 代替テキスト (Alt)
            'description': caption, // 説明
            'title': caption      // タイトル
          }),
          'muteHttpExceptions': true
        };
        UrlFetchApp.fetch(updateEndpoint, updateOptions);
      }

      return mediaId;
    } else {
      console.log("WordPressへのアップロード失敗: " + result.message);
      return null;
    }
  } catch (e) {
    console.log("画像処理エラー: " + e.toString());
    return null;
  }
}

// ==========================================
// 0. グローバル変数 & ログ収集用関数
// ==========================================
var debugLogs = []; // ログを貯める配列

function log(message) {
  console.log(message);      // GASコンソール用
  debugLogs.push(message);   // 返却レスポンス用
}

// ==========================================
// 共通レスポンス作成 (ログ出力対応版)
// ==========================================
function createResponse(statusCode, message, data) {
  const output = {
    statusCode: statusCode,
    message: message,
    data: data || null,
    debug_log: debugLogs // ★ここに実行ログが全て入ります
  };
  
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// D. 画像アップロード機能 (完全版・URL返却対応)
// ==========================================
function uploadImageToWordPress(imageUrl, fileName, siteUrl, auth) {
  if (!imageUrl) {
    log("Error: imageUrl is empty");
    return null;
  }

  log(`[Start] Upload Image process.`);
  log(`Target URL: ${imageUrl}`);
  log(`File Name: ${fileName}`);

  try {
    // 1. 画像データをWebからダウンロード
    const downloadOptions = {
      'muteHttpExceptions': true,
      'headers': {
        // User-Agent偽装 (403エラー回避)
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    
    log("Fetching image from web...");
    const imageResponse = UrlFetchApp.fetch(imageUrl, downloadOptions);
    const responseCode = imageResponse.getResponseCode();
    log(`Image Fetch Response Code: ${responseCode}`);

    if (responseCode !== 200) {
      const errorBody = imageResponse.getContentText().substring(0, 200);
      log(`Failed to fetch image. Server returned: ${errorBody}`);
      return null;
    }
    
    const blob = imageResponse.getBlob().setName(fileName);
    const blobType = blob.getContentType();
    
    // 2. WordPressへアップロード
    const endpoint = `${siteUrl}/wp-json/wp/v2/media`;
    log(`Uploading to WordPress Endpoint: ${endpoint}`);

    const uploadOptions = {
      'method': 'post',
      'headers': {
        'Authorization': auth,
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
      'contentType': blobType,
      'payload': blob,
      'muteHttpExceptions': true
    };

    const uploadResponse = UrlFetchApp.fetch(endpoint, uploadOptions);
    const uploadCode = uploadResponse.getResponseCode();
    const resultText = uploadResponse.getContentText();
    
    log(`WordPress Upload Response Code: ${uploadCode}`);

    if (uploadCode === 201) {
      const result = JSON.parse(resultText);
      log(`Upload Success! Media ID: ${result.id}`);
      
      // ★ここが重要：IDだけでなく「画像のURL」もセットで返す
      return {
        id: result.id,
        url: result.source_url  // WordPress上の画像URL
      };
      
    } else {
      log(`WordPress Upload Failed. Message: ${resultText.substring(0, 300)}`);
      return null;
    }
  } catch (e) {
    log(`Exception in uploadImageToWordPress: ${e.toString()}`);
    return null;
  }
}

// ==========================================
// F. 画像単体アップロード機能 (Difyイテレーション対応版) 修正版
// ==========================================
function handleMediaUploadOnly(data, siteUrl, auth) {
  log("Action: handleMediaUploadOnly started.");
  
  // 1. URLがあるかチェック
  if (!data.imageUrl) {
    log("Error: No imageUrl provided in JSON data.");
    return createResponse(400, "Error: imageUrl is missing");
  }

  // 2. キャプションの取得（Difyから送られてきたもの）
  const caption = data.caption || "";
  log(`Received caption: ${caption}`);

  // 3. ファイル名の自動生成
  let fileName = data.fileName;
  if (!fileName) {
    const extMatch = data.imageUrl.match(/\.(jpg|jpeg|png|webp|gif)/i);
    const ext = extMatch ? extMatch[0] : '.jpg';
    fileName = 'wp-upload-' + new Date().getTime() + ext;
  }

  // 4. WordPressへアップロード実行
  // ※uploadImageToWordPress関数の引数の最後に caption を追加しています
  const mediaId = uploadImageToWordPress(data.imageUrl, fileName, siteUrl, auth, caption);

  // 5. 結果をDifyに返す
  if (mediaId) {
    return createResponse(200, "Image Upload Success", {
      media_id: mediaId,
      // 本来のURLが必要な場合や確認用にIDを返します
      original_url: data.imageUrl,
      applied_caption: caption
    });
  } else {
    // 失敗した場合
    return createResponse(500, "Image Upload Failed. Check debug_log field.");
  }
}

// ==========================================
// G. Google Driveの古いファイル自動削除機能
// ==========================================
function deleteOldFilesInFolder() {
  // スクリプトプロパティ「TARGET_DRIVE_FOLDER_ID」にフォルダIDを設定してください
  const folderId = PropertiesService.getScriptProperties().getProperty('TARGET_DRIVE_FOLDER_ID');
  
  if (!folderId) {
    log('エラー: TARGET_DRIVE_FOLDER_IDが設定されていません');
    return;
  }
  
  try {
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFiles();
    
    // 1ヶ月前（30日前）の日付を計算
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 30);
    
    let deletedCount = 0;
    
    // フォルダ内のファイルを順番に確認
    while (files.hasNext()) {
      const file = files.next();
      const lastUpdated = file.getLastUpdated();
      
      // 最終更新日が1ヶ月以上前の場合、ゴミ箱に移動
      if (lastUpdated < thresholdDate) {
        file.setTrashed(true); // ゴミ箱へ移動
        log(`削除完了: ${file.getName()} (更新日: ${lastUpdated})`);
        deletedCount++;
      }
    }
    
    log(`処理完了: 合計 ${deletedCount} 件のファイルをゴミ箱に移動しました。`);
    
  } catch (e) {
    log('エラーが発生しました: ' + e.message);
  }
}

