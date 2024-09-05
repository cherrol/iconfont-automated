import path from 'path';
import { Builder, By, until } from 'selenium-webdriver';
import { Options } from 'selenium-webdriver/chrome.js';
import StreamZip from 'node-stream-zip';
import fs from 'fs/promises';

/* 此脚本做了以下事情：
 * 1. 登录并跳转相应的项目页面
 * 2. 检测新加的以及不符合规定的 unicode 图标
 * 3. 自适应调整图标大小
 * 4. 填写自适应的 unicode
 * 5. 如果 classname 重复了，在后面加上 iconId
 * 6. 保存，循环下一个需要编辑的图标
 * 7. 下载压缩包到本地，解压
 * 8. 生成相应的 css 文件, 重命名 eot, svg, ttf, woff, woff2 文件
 * 9. 删除下载的压缩包及解压的文件
 */

// 需要修改的配置
const USER_NAME = 'you_username';
const PASSWORD = 'you_password';
const PROJECTID = 'your_project_id';
const PROJECT_NAME = 'your_project_name';

// 一般不需要修改的配置
const START_CODE = 57345; // 0xe001 iconfont默认值，根据实际情况适当修改
const CSS_OUT = path.resolve('./iconfont/css');
const FONTS_OUT = path.resolve('./iconfont/fonts');
const URL = 'https://www.iconfont.cn';
const DOWNLOAD_DIRECTORY = path.resolve('./download');

const sleep = (time) => new Promise((r) => setTimeout(() => r(), time * 1000));

async function main() {
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(
      new Options().setUserPreferences({
        'download.default_directory': DOWNLOAD_DIRECTORY,
        'sagebrowsing.enabled': 'false',
      })
    )
    .build();

  // 预处理
  await fs.rm(DOWNLOAD_DIRECTORY, { recursive: true, force: true });
  await fs.rm(FONTS_OUT, { recursive: true, force: true });
  await fs.rm(CSS_OUT, { recursive: true, force: true });

  try {
    await driver.get(`${URL}/login`);
    console.log(`打开页面：${URL}/login`);
    await driver.wait(
      until.elementLocated(By.className('login-form-logo')),
      10000
    );
    console.log(`页面打开完成：${URL}/login`);
    console.log('\n');

    // 输入账号密码
    await driver.findElement(By.id('userid')).sendKeys(USER_NAME);
    await driver.findElement(By.id('password')).sendKeys(PASSWORD);

    // 点击登录按钮
    await driver.findElement(By.className('mx-btn-submit')).click();
    console.log(`等待登录...`);
    await driver.wait(until.elementLocated(By.className('avatar-min')), 10000);
    console.log(`登录完成。`);
    console.log('\n');

    // 跳转项目
    await driver.get(
      `${URL}/manage/index?manage_type=myprojects&projectId=${PROJECTID}&keyword=&project_type=&page=`
    );
    console.log(`打开项目...`);
    await driver.wait(until.elementLocated(By.className('icon-item')), 10000);
    console.log(`项目打开完成。`);
    console.log('\n');

    // 获取 icon 列表
    console.log('获取项目图标列表...');
    const icon_list = await driver.findElements(By.className('icon-item'));

    const iconArrPromise = icon_list.map(async (icon) => {
      const name = await icon.findElement(By.className('icon-name')).getText();
      const className = await icon.getAttribute('class');
      const iconId = className.split(' ')[0];
      const codeElements = await icon.findElements(By.className('icon-code'));
      const code = await codeElements[0].getText();
      const fullName = await driver.executeScript(
        'return arguments[0].innerText',
        codeElements[1]
      );

      // console.log(code);
      // console.log(fullName);

      console.log(`${name}: ${code.replace('&#x', '').replace(';', '')}`);

      return {
        iconElement: icon,
        name,
        fullName,
        code: Number(code.replace('&#', '0').replace(';', '')),
        code16: code.replace('&#x', '').replace(';', ''),
        iconId,
      };
    });
    const iconArr = await Promise.all(iconArrPromise);
    console.log('获取项目图标列表完成。');
    console.log('\n');

    // 修改 unicode
    let count = iconArr.length - 1;
    let unicode = START_CODE;
    // let maxCode = 0;
    // iconArr.forEach((icon) => (maxCode = Math.max(icon.code, maxCode)));

    while (count > -1) {
      // todo 检测图标是否已编辑好
      // // 检查已经编辑好的icon
      // if (
      //   iconArr[count].code >= START_CODE &&
      //   iconArr[count].code <=
      //     Math.max(START_CODE + iconArr.length - 1, maxCode)
      // ) {
      //   count--;
      //   continue;
      // }

      // 寻找未赋值的unicode
      // for (let i = START_CODE; i < START_CODE + iconArr.length; i++) {
      //   if (!iconArr.find((icon) => icon.code === i)) {
      //     unicode = i;

      //     iconArr[count].code = i;
      //     iconArr[count].code16 = i.toString(16).replace("0x", "");

      //     break;
      //   }
      // }

      await driver.wait(until.elementLocated(By.className('icon-item')), 10000);

      console.log(`开始编辑: ${iconArr[count].fullName}`);

      await driver.executeScript(
        `document.querySelector('.${iconArr[count].iconId} span[title="编辑"]').click()`
      );

      // todo 用相关方法替换掉 sleep
      await sleep(1);
      // 等待弹窗打开
      // await driver.wait(
      //   until.elementLocated(By.className(".mp-e2e-dialog")),
      //   10000
      // );

      await driver.executeScript(() => {
        // 计算容器中心位置
        let svgRect = document
          .querySelector('#J_icon_container svg')
          .getBoundingClientRect();

        const svgCenter = {
          x: svgRect.left + svgRect.width / 2,
          y: svgRect.top + svgRect.height / 2,
        };

        // 计算 path 参数
        let width,
          height,
          pathCenter = { x: 0, y: 0 };

        const getRect = () => {
          let top = 9999,
            left = 9999,
            right = 0,
            bottom = 0;

          document
            .querySelectorAll('#J_icon_container svg path')
            .forEach((path) => {
              const rect = path.getBoundingClientRect();

              top = Math.min(top, rect.top);
              left = Math.min(left, rect.left);
              bottom = Math.max(bottom, rect.top + rect.height);
              right = Math.max(right, rect.left + rect.width);
            });

          width = right - left;
          height = bottom - top;
          pathCenter = {
            x: (right - left) / 2 + left,
            y: (bottom - top) / 2 + top,
          };
        };
        getRect();

        // 调整大小，设置区间为 360 - 380 之间
        while (width < 360 || height < 360) {
          console.log('调整大小');
          document.querySelector('[mx-click="transform(\'scaleUp\')"]').click();

          getRect();
        }
        while (width > 380 || height > 380) {
          console.log('调整大小');
          document
            .querySelector('[mx-click="transform(\'scaleDown\')"]')
            .click();

          getRect();
        }

        // 每次移动大概是 1/3 格，400/16/3
        const distancePerMove = 400 / 16 / 3;

        // 调整 top
        while (pathCenter.y - svgCenter.y > distancePerMove) {
          console.log('top');
          document.querySelector('[mx-click="transform(\'top\')"]').click();
          getRect();
        }

        // 调整 bottom
        while (pathCenter.y - svgCenter.y < distancePerMove * -1) {
          console.log('bottom');
          document.querySelector('[mx-click="transform(\'bottom\')"]').click();
          getRect();
        }

        // 调整 left
        while (pathCenter.x - svgCenter.x > distancePerMove) {
          console.log('left');
          document.querySelector('[mx-click="transform(\'left\')"]').click();
          getRect();
        }

        // 调整 right
        while (pathCenter.x - svgCenter.x < distancePerMove * -1) {
          console.log('right');
          document.querySelector('[mx-click="transform(\'right\')"]').click();
          getRect();
        }
      });

      console.log('写入unicode: ', Number(unicode).toString(16));
      await driver.executeScript(
        `document.getElementById('J_edit_dialog_unicode').value="${Number(
          unicode
        ).toString(16)}"`
      );

      await driver.executeScript(
        `document.querySelector('span[mx-click="update()"]').click()`
      );

      // todo 用相关方法替换掉 sleep
      await sleep(1);
      // 等待弹窗关闭
      // await driver.wait(
      //   until.elementIsNotVisible(By.className(".mp-e2e-dialog"), 10000)
      // );
      // 等待页面重新刷新
      // await driver.wait(until.elementLocated(By.className("icon-item")), 10000);

      // todo: unicode 重复时做处理 - Unicode 自动 +1 ，直到不重复
      // await driver.executeScript(`
      //   if(document.querySelector('.tip-box .text') && document.querySelector('.tip-box .text').innerHTML === 'font_class 重复了，换个font_class吧') {
      //     document.getElementById('J_edit_dialog_fontclass').value=document.getElementById('J_edit_dialog_fontclass').value + '-' + ${
      //       iconArr[count].iconId.split("_")[3]
      //     };
      //     document.querySelector('span[mx-click="update()"]').click()
      //   }`);
      // await sleep(1);
      // await driver.executeScript(
      //   `document.querySelector('.mp-e2e-dialog-close') && document.querySelector('.mp-e2e-dialog-close').click()`
      // );

      console.log(`编辑完成：${iconArr[count].fullName} \n`);
      count--;
      unicode++;
      // await sleep(1);
      await driver.wait(until.elementLocated(By.className('icon-item')), 10000);
    }

    // 点击下载文件
    await driver.executeScript(
      `document.querySelector('a[href^="/api/project/download.zip"]').click()`
    );

    // todo 等待文件下载完成后关闭
    await sleep(2);
    await driver.quit();

    console.log(`一共 ${iconArr.length} 个图标。`);

    // 解压文件
    console.log('开始处理文件');
    const Unzip = async (file, outfile) => {
      return new Promise((reslove, reject) => {
        const zip = new StreamZip({ file: file, storeEntries: true });
        zip.on('error', (err) => {
          reject(err);
        });
        zip.on('ready', () => {
          zip.extract(null, outfile, (err, count) => {
            if (err) {
              reject(false);
            } else {
              reslove();
            }
            zip.close();
          });
        });
      }).catch((err) => {
        console.log('eror', err);
      });
    };
    await Unzip(
      path.join(DOWNLOAD_DIRECTORY, './download.zip'),
      DOWNLOAD_DIRECTORY
    );

    // 获取解压后的文件夹名
    let fontDir;
    const iconfontFiles = await fs.readdir(DOWNLOAD_DIRECTORY);
    for (const file of iconfontFiles) {
      if (file.indexOf('font_') === 0) {
        fontDir = file;
      }
    }

    // 生成 css
    let cssIconsStr = '';

    iconArr.forEach((icon) => {
      cssIconsStr += `.${icon.fullName}:before {content: "\\${icon.code16}";}`;
    });

    let cssTemplateStr = await fs.readFile(
      path.resolve('./src/font.css.template'),
      {
        encoding: 'utf-8',
      }
    );

    cssTemplateStr = cssTemplateStr
      .replace(/{{ PROJECT_NAME }}/g, PROJECT_NAME)
      .replace('{{ FONT_ICONS }}', cssIconsStr);

    await fs.mkdir(CSS_OUT, { recursive: true });
    await fs.writeFile(CSS_OUT + '/font.css', cssTemplateStr);
    // 重命名 iconfont
    await fs.mkdir(FONTS_OUT, { recursive: true });
    ['eot', 'svg', 'ttf', 'woff', 'woff2'].forEach(async (suffix) => {
      await fs.copyFile(
        `${DOWNLOAD_DIRECTORY}/${fontDir}/iconfont.${suffix}`,
        `${FONTS_OUT}/${PROJECT_NAME}.${suffix}`
      );
    });

    console.log('文件处理完毕');
  } catch (e) {
    console.error(e);
    await driver.quit();
  }
}

main();
