# InstaBasket

Instagram'da profilleri ve gönderileri sürükleyip bir "sepete" bırakmanı sağlayan Chrome eklentisi.

## Nasıl çalışır

- `instagram.com` üzerindeyken adres çubuğundaki URL'yi (ya da sayfadaki bir profil/gönderi linkini) sürükleyip sayfanın üzerine getir.
- Sağ üst köşede **🧺 Sepete bırak** kutusu açılır; linki oraya bırak.
- Sürüklemek yerine eklenti ikonuna tıklayıp **+ Bu sayfayı ekle** butonunu da kullanabilirsin.

Sepet iki bölümden oluşur:

- **Profiller:** Profil linki bırakınca profil, fotoğrafı ve adıyla birlikte eklenir.
- **Görseller:** Gönderi, reel ya da video linki bırakınca (ör. `instagram.com/p/KOD/?img_index=1`) gönderinin sahibi bulunur ve görsel o kullanıcının altına eklenir. Kullanıcı profillerde yoksa otomatik olarak profillere de eklenir.

Profil ve kapak görselleri eklentinin içine küçük resim olarak kaydedilir; Instagram'ın görsel linkleri zamanla geçersiz olsa da listede görünmeye devam ederler. Bir bilgi o an çekilemezse (bağlantı hatası vb.) Instagram'ı bir sonraki açışında arka planda tamamlanır.

## Kurulum

1. Depoyu ZIP olarak indirip aç.
2. Chrome'da `chrome://extensions` adresini aç.
3. Sağ üstten **Geliştirici modu**nu aç.
4. **Paketlenmemiş öğe yükle** butonuna basıp `extension` klasörünü seç.
5. Açık Instagram sekmeleri varsa yenile.

Eklentiyi güncellediğinde `chrome://extensions` sayfasında eklentinin yenile (⟳) butonuna bas ve Instagram sekmelerini yenile.
