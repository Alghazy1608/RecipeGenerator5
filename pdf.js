/* A small PDF writer: A4 pages, built-in Helvetica fonts and JPEG photos. */
(function (root) {
  const W = 595.28, H = 841.89, M = 48, CONTENT = W - 2 * M;
  const GREEN = [0.12, 0.3, 0.23], INK = [0.1, 0.16, 0.13], MUTED = [0.36, 0.42, 0.38], CHILLI = [0.62, 0.16, 0.12], PALE = [0.93, 0.95, 0.89], BLUSH = [0.99, 0.93, 0.91], GOLD = [0.85, 0.6, 0.11];
  const CP1252 = { "€": 128, "‚": 130, "ƒ": 131, "„": 132, "…": 133, "†": 134, "‡": 135, "ˆ": 136, "‰": 137, "Š": 138, "‹": 139, "Œ": 140, "Ž": 142, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151, "˜": 152, "™": 153, "š": 154, "›": 155, "œ": 156, "ž": 158, "Ÿ": 159 };

  function encode(text) {
    const out = [];
    for (const ch of String(text).normalize("NFC").replace(/\s+/g, " ")) {
      const c = ch.codePointAt(0);
      if (CP1252[ch]) out.push(CP1252[ch]);
      else if (c >= 32 && c < 127 || c >= 160 && c <= 255) out.push(c);
      else {
        const plain = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
        const p = plain.codePointAt(0);
        out.push(plain && p >= 32 && p < 127 ? p : 63);
      }
    }
    return out;
  }
  const hex = (bytes) => bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  const num = (n) => (Math.round(n * 100) / 100).toString();
  const rgb = (c, op) => `${c.map(num).join(" ")} ${op}`;

  class Doc {
    constructor(title) { this.title = title; this.pages = []; this.images = []; this.addPage(); }
    addPage() { this.ops = []; this.pages.push(this.ops); this.y = M; }
    width(text, size, font = "regular") { const t = root.PDF_WIDTHS[font === "bold" ? "bold" : "regular"]; return encode(text).reduce((s, b) => s + t[b], 0) * size / 1000; }
    wrap(text, size, maxWidth, font) {
      const lines = []; let line = "";
      for (const word of String(text).trim().split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (this.width(next, size, font) > maxWidth && line) { lines.push(line); line = word; } else line = next;
      }
      if (line) lines.push(line);
      return lines;
    }
    text(text, x, y, size, font = "regular", color = INK) {
      const name = { regular: "F1", bold: "F2", italic: "F3" }[font];
      this.ops.push(`${rgb(color, "rg")} BT /${name} ${size} Tf ${num(x)} ${num(H - y)} Td <${hex(encode(text))}> Tj ET`);
    }
    rect(x, y, w, h, fill, stroke) {
      if (fill) this.ops.push(`${rgb(fill, "rg")} ${num(x)} ${num(H - y - h)} ${num(w)} ${num(h)} re f`);
      if (stroke) this.ops.push(`${rgb(stroke, "RG")} 0.6 w ${num(x)} ${num(H - y - h)} ${num(w)} ${num(h)} re S`);
    }
    need(h) { if (this.y + h > H - M - 8) this.addPage(); }
    para(text, { size = 10, font = "regular", color = INK, x = M, width = CONTENT, gap = 3 } = {}) {
      const lead = size * 1.4;
      for (const line of this.wrap(text, size, width, font)) { this.need(lead); this.text(line, x, this.y + size, size, font, color); this.y += lead; }
      this.y += gap;
    }
    heading(text) { this.need(38); this.y += 10; this.text(text, M, this.y + 13, 13, "bold", GREEN); this.y += 21; }
    box(lines, size = 8.5) {
      const wrapped = lines.flatMap((l) => this.wrap(l, size, CONTENT - 16)), h = wrapped.length * size * 1.4 + 12;
      this.need(h); this.rect(M, this.y, CONTENT, h, BLUSH, CHILLI);
      wrapped.forEach((l, i) => this.text(l, M + 8, this.y + 6 + size + i * size * 1.4, size, "regular", CHILLI));
      this.y += h + 6;
    }
    image(photo, x, y, w, h) {
      this.images.push(photo);
      this.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(H - y - h)} cm /Im${this.images.length} Do Q`);
    }
    build() {
      this.pages.forEach((ops, i) => {
        this.ops = ops;
        this.text(this.title.slice(0, 80), M, H - 26, 7.5, "regular", MUTED);
        const label = `Page ${i + 1} of ${this.pages.length}`;
        this.text(label, W - M - this.width(label, 7.5), H - 26, 7.5, "regular", MUTED);
      });
      const chunks = [], offsets = [], enc = new TextEncoder();
      let length = 0;
      const put = (p) => { const b = typeof p === "string" ? enc.encode(p) : p; chunks.push(b); length += b.length; };
      const object = (n, body, stream) => {
        offsets[n] = length;
        put(`${n} 0 obj\n${body}\n`);
        if (stream) { put("stream\n"); put(stream); put("\nendstream\n"); }
        put("endobj\n");
      };
      put("%PDF-1.4\n");
      const nPages = this.pages.length, firstPage = 6 + this.images.length;
      object(1, "<< /Type /Catalog /Pages 2 0 R >>");
      object(2, `<< /Type /Pages /Count ${nPages} /Kids [${this.pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(" ")}] >>`);
      ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique"].forEach((f, i) => object(3 + i, `<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
      this.images.forEach((img, i) => object(6 + i, `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>`, img.bytes));
      const xobjects = this.images.map((_, i) => `/Im${i + 1} ${6 + i} 0 R`).join(" ");
      this.pages.forEach((ops, i) => {
        const pageN = firstPage + i * 2, content = enc.encode(ops.join("\n"));
        object(pageN, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${pageN + 1} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> /XObject << ${xobjects} >> >> >>`);
        object(pageN + 1, `<< /Length ${content.length} >>`, content);
      });
      const count = firstPage + nPages * 2, xref = length;
      put(`xref\n0 ${count}\n0000000000 65535 f \n`);
      for (let i = 1; i < count; i++) put(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
      put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
      return new Blob(chunks, { type: "application/pdf" });
    }
  }

  function buildRecipePdf(recipe, photos, allergens, notes, flags) {
    const d = new Doc(recipe.title), n = recipe.nutrition;
    for (const line of d.wrap(recipe.title, 24, CONTENT, "bold")) { d.text(line, M, d.y + 24, 24, "bold", GREEN); d.y += 30; }
    d.y += 2;
    d.para(recipe.description, { size: 10.5, font: "italic", color: MUTED, gap: 6 });
    const dish = photos.find((p) => p.is_dish), others = photos.filter((p) => p !== dish).slice(0, 3);
    if (dish) {
      const crop = dish.crop(CONTENT / (CONTENT * 0.4));
      d.image(crop, M, d.y, CONTENT, CONTENT * 0.4);
      d.y += CONTENT * 0.4 + 3;
      d.para("Similar dish for illustration. Your result may look different.", { size: 7, color: MUTED, gap: 5 });
    }
    const stats = [["Serves", recipe.servings], ["Prep", `${recipe.prep_minutes} min`], ["Cook", `${recipe.cook_minutes} min`], ["Total", `${recipe.prep_minutes + recipe.cook_minutes} min`], ["Level", recipe.difficulty], ["Calories", `${Math.round(n.calories_per_serving)} kcal`]];
    d.rect(M, d.y, CONTENT, 38, PALE);
    d.rect(M, d.y, 4, 38, GOLD);
    stats.forEach(([k, v], i) => {
      const x = M + 8 + i * (CONTENT - 8) / 6;
      d.text(v, x, d.y + 17, 10.5, "bold", INK); d.text(k, x, d.y + 30, 7, "regular", MUTED);
    });
    d.y += 44;
    if (allergens.length) d.box([`Allergens you asked to avoid: ${allergens.join(", ")}. Automatic checks found none in this recipe, but always read product labels and check for cross-contamination.`]);
    else if (recipe.allergens_present.length) d.box([`Contains or may contain: ${recipe.allergens_present.join(", ")}.`]);
    if (notes.length) d.box(notes);
    d.heading("Ingredients");
    for (const item of recipe.ingredients) {
      const name = item.name + (item.healthy_note ? ` (${item.healthy_note})` : ""), lines = d.wrap(name, 10, CONTENT - 96), h = lines.length * 14 + 4;
      d.need(h);
      d.text(item.amount, M, d.y + 11, 10, "bold", INK);
      lines.forEach((l, i) => d.text(l, M + 96, d.y + 11 + i * 14, 10));
      d.y += h;
      d.rect(M, d.y - 1, CONTENT, 0.4, PALE);
    }
    d.heading("Utensils");
    d.para(recipe.utensils.join(", ") || "None listed");
    d.heading("Method");
    recipe.steps.forEach((step, i) => {
      const lines = d.wrap(step, 10, CONTENT - 24);
      d.need(lines.length * 14 + 5);
      d.text(String(i + 1), M, d.y + 11, 10, "bold", GREEN);
      lines.forEach((l, j) => d.text(l, M + 24, d.y + 11 + j * 14, 10));
      d.y += lines.length * 14 + 5;
    });
    d.need(100); d.heading("Nutrition per serving (estimated)");
    const facts = [["Calories", `${Math.round(n.calories_per_serving)} kcal`], ["Protein", `${Math.round(n.protein_g)} g`], ["Carbs", `${Math.round(n.carbs_g)} g`], ["Fat", `${Math.round(n.fat_g)} g`], ["Sat. fat", `${Math.round(n.saturated_fat_g)} g`], ["Sugar", `${Math.round(n.sugar_g)} g`], ["Fibre", `${Math.round(n.fibre_g)} g`], ["Sodium", `${Math.round(n.sodium_mg)} mg`]];
    d.need(64); d.rect(M, d.y, CONTENT, 36, null, GREEN);
    facts.forEach(([k, v], i) => {
      const x = M + 6 + i * (CONTENT - 6) / 8;
      d.text(k, x, d.y + 13, 7, "regular", MUTED); d.text(v, x, d.y + 27, 9, "bold", INK);
    });
    d.y += 42;
    d.para(`Whole recipe: about ${Math.round(n.calories_per_serving * recipe.servings)} kcal for ${recipe.servings} serving(s). ${recipe.origin === "ai" ? "AI estimates." : "Estimated from a built-in food table."} Figures vary with brands and portions.`, { size: 7.5, color: MUTED });
    flags.forEach((f) => d.para(f, { size: 8.5, color: CHILLI }));
    [["Why this is a healthy choice", recipe.healthy_choices], ["Add-on suggestions", recipe.add_on_suggestions]].forEach(([title, items]) => {
      if (!items.length) return;
      d.heading(title);
      items.forEach((i) => d.para(`• ${i}`, { gap: 1 }));
    });
    if (others.length) {
      const w = (CONTENT - 16) / 3, h = w * 0.68;
      d.need(h + 50); d.heading("Key ingredients");
      others.forEach((p, i) => {
        const x = M + i * (w + 8), label = p.label.replace(/\b\w/g, (c) => c.toUpperCase());
        d.image(p.crop(w / h), x, d.y, w, h);
        d.text(label, x, d.y + h + 10, 7.5, "regular", MUTED);
      });
      d.y += h + 18;
    }
    if (photos.length) {
      d.need(30); d.y += 8;
      d.para("Image credits", { size: 7.5, font: "bold", color: MUTED, gap: 1 });
      photos.forEach((p) => d.para(`${p.label}: ${p.credit}. ${p.source_url}`, { size: 7, color: MUTED, gap: 1 }));
    }
    return d.build();
  }
  root.buildRecipePdf = buildRecipePdf;
})(window);
