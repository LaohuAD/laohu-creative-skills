/* All interface copy, charts, portraits and symbols are editable drawing code. */
export function createInterfaceTextures(THREE, variables) {
  const blue = variables.blue || '#477aff';
  const purple = variables.purple || '#743fea';
  const title = variables.documentTitle || 'Project Overview';
  const texture = (draw, width = 1024, height = 768) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  };
  const rounded = (context, x, y, width, height, radius, color) => {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fillStyle = color;
    context.fill();
  };
  const text = (context, copy, x, y, size = 32, color = '#485ca0', weight = 400) => {
    context.fillStyle = color;
    context.font = `${weight} ${size}px Inter`;
    context.fillText(copy, x, y);
  };
  const bars = (context, x, y, width, count, color = '#71b4dc', gap = 22) => {
    for (let row = 0; row < count; row++) {
      const length = width * [1, 0.78, 0.91, 0.65, 0.88][row % 5];
      rounded(context, x, y + row * gap, length, 5, 2.5, color);
    }
  };
  const windowFrame = (context, width, height, header = '#7aa8ef', paper = '#eef4ff') => {
    rounded(context, 2, 2, width - 4, height - 4, 14, paper);
    rounded(context, 2, 2, width - 4, 38, 12, header);
    context.fillStyle = header;
    context.fillRect(2, 24, width - 4, 16);
    for (let index = 0; index < 3; index++) {
      context.beginPath();
      context.arc(17 + index * 18, 20, 5, 0, Math.PI * 2);
      context.fillStyle = ['#c1edff', '#a4cbf8', '#98b4ec'][index];
      context.fill();
    }
  };
  const chart = (context, x, y, width, height, orange = false) => {
    const fill = context.createLinearGradient(x, y, x + width, y + height);
    fill.addColorStop(0, orange ? '#ffb43a' : '#387ee6');
    fill.addColorStop(1, orange ? '#f57c82' : '#3a56cb');
    rounded(context, x, y, width, height, 5, fill);
    context.strokeStyle = '#ffffff7a';
    context.lineWidth = 1.5;
    for (let index = 0; index <= 10; index++) {
      context.beginPath();
      context.moveTo(x + index * width / 10, y);
      context.lineTo(x + index * width / 10, y + height);
      context.stroke();
    }
    for (let index = 0; index <= 7; index++) {
      context.beginPath();
      context.moveTo(x, y + index * height / 7);
      context.lineTo(x + width, y + index * height / 7);
      context.stroke();
    }
    context.beginPath();
    for (let index = 0; index <= 100; index++) {
      const fraction = index / 100;
      const amount = 0.2 + fraction * 0.53 + Math.sin(fraction * 10.2) * 0.19;
      const py = y + height * (1 - amount);
      if (index === 0) context.moveTo(x, py);
      else context.lineTo(x + width * fraction, py);
    }
    context.strokeStyle = '#fff4e5';
    context.lineWidth = 4;
    context.stroke();
  };
  const table = (context, x, y, width, height, vivid = false) => {
    context.fillStyle = vivid ? '#4249cc' : '#d4e4f8';
    context.fillRect(x, y, width, height);
    const rows = 8;
    const columns = 6;
    const cw = width / columns;
    const rh = height / rows;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const selected = (row * 3 + column * 5) % 13;
        context.fillStyle = selected === 1 ? '#fbad46'
          : selected === 4 ? (vivid ? '#bc4fdb' : '#35415e')
            : (row + column) % 4 === 0 ? '#ecf6ff' : vivid ? '#3249c5' : '#d0e0f5';
        context.fillRect(x + column * cw + 1, y + row * rh + 1, cw - 2, rh - 2);
      }
    }
  };
  const art = (context, x, y, size) => {
    const fill = context.createLinearGradient(x, y, x + size, y + size);
    fill.addColorStop(0, '#ffbc3d');
    fill.addColorStop(1, '#ffdb8f');
    rounded(context, x, y, size, size, 3, fill);
    for (let ring = 0; ring < 3; ring++) {
      context.beginPath();
      context.ellipse(x + size * 0.53, y + size * (0.67 - ring * 0.15),
        size * (0.32 - ring * 0.085), size * (0.26 - ring * 0.06), 0, 0, Math.PI * 2);
      context.fillStyle = ['#ed6e8b', '#f6a379', '#ffe7a7'][ring];
      context.fill();
    }
    context.beginPath();
    context.arc(x + size * 0.53, y + size * 0.18, size * 0.08, 0, Math.PI * 2);
    context.fillStyle = '#fffde3';
    context.fill();
  };
  const maps = {};
  maps.project = texture((context, width, height) => {
    windowFrame(context, width, height, '#729ae0', '#a8bce6');
    text(context, 'Project', 40, 100, 36, '#ffffff');
    bars(context, 40, 124, width - 85, 2, '#dceeff', 21);
    rounded(context, 40, 190, width - 80, 150, 3, '#6777bf');
    for (let index = 0; index < 4; index++) {
      context.fillStyle = '#f9ffff';
      const h = [72, 45, 98, 61][index];
      context.fillRect(68 + index * 83, 320 - h, 48, h);
    }
    text(context, 'Overview', 40, 400, 34, '#f4fbff');
    bars(context, 40, 430, width - 85, 5, '#e2f4ff', 24);
    text(context, 'Results', 40, 612, 34, '#f4fbff');
    context.beginPath();
    context.moveTo(116, 718);
    context.arc(116, 718, 65, 0, Math.PI * 1.55);
    context.closePath();
    context.fillStyle = '#334578';
    context.fill();
    bars(context, 225, 665, 222, 5, '#5c79a9', 23);
  }, 512, 828);
  maps.news = texture((context, width, height) => {
    windowFrame(context, width, height, '#4467c6');
    text(context, 'NEWS', 42, 112, 47, '#82a4dd', 700);
    bars(context, 245, 78, width - 290, 2, '#7e9ed0', 23);
    bars(context, 42, 157, width - 84, 3, '#7e9ed0', 24);
    rounded(context, 42, 260, width - 84, 190, 4, '#b6d2f0');
    context.beginPath();
    context.arc(width / 2, 355, 37, 0, Math.PI * 2);
    context.strokeStyle = '#5d7bb8';
    context.lineWidth = 3;
    context.stroke();
    context.beginPath();
    context.moveTo(width / 2 - 9, 336);
    context.lineTo(width / 2 + 18, 355);
    context.lineTo(width / 2 - 9, 374);
    context.closePath();
    context.fillStyle = '#5d7bb8';
    context.fill();
    bars(context, 42, 490, width - 84, 3, '#a0bde2', 21);
  }, 760, 600);
  maps.calendar = texture((context, width, height) => {
    windowFrame(context, width, height);
    context.strokeStyle = '#bdcbe1';
    context.lineWidth = 2;
    for (let column = 0; column < 7; column++) {
      context.beginPath();
      context.moveTo(column * width / 7, 42);
      context.lineTo(column * width / 7, height);
      context.stroke();
    }
    for (let row = 0; row < 6; row++) {
      context.beginPath();
      context.moveTo(0, 42 + row * (height - 42) / 6);
      context.lineTo(width, 42 + row * (height - 42) / 6);
      context.stroke();
      for (let column = 0; column < 7; column++) text(context, String(row * 7 + column + 1), column * width / 7 + 12, 65 + row * (height - 42) / 6, 13, '#a8b8d3');
    }
    context.strokeStyle = '#7a6de1';
    context.strokeRect(width * 3 / 7, 42 + (height - 42) / 3, width / 7, (height - 42) / 6);
  }, 760, 600);
  maps.table = texture((context, width, height) => {
    windowFrame(context, width, height);
    table(context, 8, 48, width - 16, height - 56);
  }, 760, 460);
  maps.chat = texture((context, width, height) => {
    windowFrame(context, width, height, '#405ab8');
    for (let row = 0; row < 8; row++) {
      const left = row % 2 === 0;
      rounded(context, left ? 30 : 120, 72 + row * 48, 220, 28, 8, left ? '#899fe1' : '#5978bf');
    }
    rounded(context, 20, height - 48, width - 40, 30, 15, '#b7ceef');
  }, 420, 540);
  maps.document = texture((context, width, height) => {
    context.fillStyle = '#f6f6ff';
    context.fillRect(0, 0, width, height);
    text(context, title, 58, 102, 48, purple, 700);
    bars(context, 58, 138, width - 116, 3, '#8199dc', 25);
    chart(context, 58, 254, 414, 235);
    art(context, 504, 254, 203);
    bars(context, 58, 542, width - 116, 5, '#7aadd4', 26);
    text(context, 'Assignments', 58, 737, 36, purple, 700);
    table(context, 58, 782, width - 116, 290);
    rounded(context, width / 2 - 65, 1146, 130, 50, 9, '#f0a245');
    context.strokeStyle = '#f0a245';
    context.lineWidth = 3;
    for (let branch = 0; branch < 3; branch++) {
      const x = 170 + branch * 210;
      context.beginPath();
      context.moveTo(width / 2, 1196);
      context.lineTo(width / 2, 1230);
      context.lineTo(x, 1230);
      context.lineTo(x, 1264);
      context.stroke();
      rounded(context, x - 62, 1264, 124, 53, 6, '#f8c573');
    }
    const video = context.createLinearGradient(58, 1380, 708, 1590);
    video.addColorStop(0, '#74c8df');
    video.addColorStop(1, '#547cd6');
    rounded(context, 58, 1380, width - 116, 240, 8, video);
    text(context, '▷', width / 2 - 28, 1532, 76, '#ffffff');
    bars(context, 58, 1670, width - 116, 4, '#85b5d8', 25);
    text(context, 'Time Table', 58, 1830, 37, purple, 700);
    table(context, 58, 1870, width - 116, 260, true);
  }, 768, 2200);
  maps.overview = texture((context, width, height) => {
    windowFrame(context, width, height, '#f2edff', '#f5f2ff');
    text(context, title, 65, 122, 44, purple, 700);
    bars(context, 65, 160, width - 170, 3, '#9b7cdf', 22);
    chart(context, 65, 265, 630, 250);
    art(context, 728, 265, 236);
    text(context, 'Time Table', 65, 590, 37, purple, 700);
    table(context, 65, 624, width - 130, 150, true);
  }, 1024, 800);
  maps.modal = texture((context, width, height) => {
    rounded(context, 3, 3, width - 6, height - 6, 16, '#f5f9ff');
    rounded(context, width / 2 - 28, 23, 56, 5, 2, '#acb6de');
    rounded(context, 45, 78, 28, 25, 4, blue);
    text(context, '↕', 51, 99, 25, '#ffffff', 700);
    rounded(context, 100, 85, 115, 9, 4, blue);
    rounded(context, 237, 85, 115, 9, 4, blue);
    text(context, '↻', 45, 157, 40, '#5b9ddb');
    rounded(context, 100, 135, 250, 9, 4, '#73addd');
    context.fillStyle = '#b4c6e4';
    context.fillRect(40, 191, width - 80, 2);
    rounded(context, 42, 225, width - 84, 72, 9, '#5ab4ef');
    text(context, 'View on your own', 85, 273, 31, '#263f8c');
  }, 520, 338);
  maps.share = texture((context, width, height) => {
    const fill = context.createLinearGradient(0, 0, width, height);
    fill.addColorStop(0, '#8664f6');
    fill.addColorStop(1, '#4c27bd');
    rounded(context, 3, 3, width - 6, height - 6, 30, fill);
    rounded(context, width / 2 - 30, 22, 60, 5, 2.5, '#adabf2');
    context.beginPath();
    context.arc(width / 2, height * 0.34, 108, 0, Math.PI * 2);
    context.fillStyle = '#e7e3ff';
    context.fill();
    rounded(context, width / 2 - 51, height * 0.34 - 43, 102, 73, 5, '#8969e1');
    text(context, '↑', width / 2 - 28, height * 0.34 + 13, 76, '#ffffff', 700);
    rounded(context, width / 2 - 30, height * 0.34 + 43, 60, 8, 4, '#b5a9ee');
    for (let row = 0; row < 3; row++) {
      rounded(context, 55, 430 + row * 60, 68, 10, 5, '#ec86cf');
      rounded(context, 153, 430 + row * 60, 154, 10, 5, '#ef9e80');
    }
    bars(context, 55, 626, width - 110, 3, '#d7ceff', 22);
  }, 620, 750);
  maps.charts = texture((context, width, height) => {
    windowFrame(context, width, height, '#e7eaff', '#f0f2ff');
    bars(context, 50, 65, width - 120, 2, '#6f7dbf', 20);
    chart(context, 70, 150, 540, 350, true);
    rounded(context, 660, 150, 260, 305, 10, '#6284e0');
    bars(context, 700, 190, 180, 8, '#b7c7ef', 27);
    table(context, 70, 555, width - 140, 270, true);
  }, 1024, 890);
  maps.video = texture((context, width, height) => {
    windowFrame(context, width, height, '#e7eaff', '#f1f4ff');
    bars(context, 50, 67, width - 100, 2, '#8ba9d9', 18);
    const fill = context.createLinearGradient(70, 145, width - 70, height - 110);
    fill.addColorStop(0, '#2311ad');
    fill.addColorStop(1, '#147cd3');
    rounded(context, 70, 145, width - 140, height - 255, 6, fill);
    context.beginPath();
    context.arc(width / 2, height / 2 + 12, 43, 0, Math.PI * 2);
    context.strokeStyle = '#dbeaff';
    context.lineWidth = 3;
    context.stroke();
    text(context, '▷', width / 2 - 24, height / 2 + 35, 65, '#e9f6ff');
    bars(context, 50, height - 80, width - 120, 3, '#90afdc', 19);
  }, 1024, 760);
  maps.avatars = texture((context, width, height) => {
    const colors = ['#6d40dc', '#ed9b79', '#427ee6'];
    for (let index = 0; index < 3; index++) {
      const y = index * height / 3;
      context.fillStyle = colors[index];
      context.fillRect(0, y, width, height / 3);
      context.beginPath();
      context.ellipse(width / 2, y + 116, 60, 36, 0, Math.PI, 0);
      context.fillStyle = ['#3296d8', '#4723ad', '#8556d0'][index];
      context.fill();
      context.beginPath();
      context.ellipse(width / 2, y + 54, 26, 34, 0, 0, Math.PI * 2);
      context.fillStyle = '#fff9eb';
      context.fill();
      context.beginPath();
      context.ellipse(width / 2 - 4, y + 22, 36, 15, -0.14, 0, Math.PI * 2);
      context.fillStyle = ['#ffd94b', '#6333b8', '#8e65d2'][index];
      context.fill();
      if (index === 1) {
        context.fillStyle = '#6333b8';
        context.fillRect(width / 2 - 31, y + 30, 12, 63);
      }
      if (index === 2) {
        context.strokeStyle = '#5a488c';
        context.lineWidth = 3;
        context.strokeRect(width / 2 - 25, y + 42, 21, 18);
        context.strokeRect(width / 2 + 4, y + 42, 21, 18);
      }
    }
  }, 190, 360);
  maps.icon = texture((context, width, height) => {
    rounded(context, 8, 8, width - 16, height - 16, 64, purple);
    rounded(context, 56, 70, 165, 27, 13, '#dedfff');
    rounded(context, 56, 126, 115, 27, 13, '#dedfff');
  }, 300, 300);
  return maps;
}
