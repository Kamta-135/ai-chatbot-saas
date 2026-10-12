// Phone ki badi photo (5-10 MB) seedha bhejne se upload dheema hota hai. Yahan browser mein hi
// photo ko max 1600px ki JPEG bana dete hain (analysis ke liye kaafi hai, 10x tez upload).

export async function fileToDataUrlResized(
    file: File,
    maxSide = 1600,
    quality = 0.85,
    decodeTimeoutMs = 4000
): Promise<string> {
    const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

    try {
        // Kuch formats (jaise HEIC) par browser na onload deta hai na onerror, to hamesha ke liye latak sakta tha
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("image decode timeout")), decodeTimeoutMs);
            const i = new Image();
            i.onload = () => {
                clearTimeout(timer);
                resolve(i);
            };
            i.onerror = () => {
                clearTimeout(timer);
                reject(new Error("image decode failed"));
            };
            i.src = raw;
        });

        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const small = file.size < 1.5 * 1024 * 1024;
        const okType = file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp";
        if (scale === 1 && small && okType) return raw;

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return raw;
        ctx.fillStyle = "#ffffff"; // PNG ka transparent hissa JPEG mein kaala na ho
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", quality);
    } catch {
        return raw; // decode na ho paye (jaise HEIC) to original hi bhej do
    }
}
