/// xd 插件開發文檔可參閱
/// https://developer.adobe.com/xd/uxp/develop/tutorials/quick-start/

const application = require("application")
const assets = require('assets')
const clipboard = require('clipboard')
const { Color, LinearGradient, RadialGradient, Artboard, SymbolInstance } = require('scenegraph')
const uxp = require('uxp')
const fs = uxp.storage.localFileSystem
const {
  showAlert,
  sortColorNameList,
  stringify,
  alphaToPercentage,
  shouldUseBlackText,
  shouldUseBlackTextForGradient,
  createValueStorage,
  updateVueStorageData,
} = require('./helper/v1')

async function importAssetsColors(selection, documentRoot
) {
  const aFile = await fs.getFileForOpening({ types: ["json"] })
  if (!aFile) return

  let config
  try {
    config = JSON.parse(await aFile.read())
  } catch (error) {
    showAlert(`導入的顏色檔有問題 (${error.message})`)
    return
  }

  /** @type {import('./type/common.d.ts').AssetsColor[]} */
  const allAssetsColors = assets.colors.get().reduce((p, e) => {
    const [, colorName] = e.name?.match(/^([A-z]+\d+).*$/) || []
    if (!colorName) return p
    p[colorName] = e
    return p
  }, {})
  const addColors = []
  const deleteColors = []
  // 匹配到相同的色號 <color 舊, color 新>
  const sameColorMap = new Map()

  try {
    for (const colorName in config) {
      const {
        description,
        hex, // 有表示純色
        opacity, // 給純色用的
        gradientType,  // 有表示漸層 (linear|radial)
        colorStops, // 漸層色列表 color[]
      } = config[colorName]

      // 純色
      if (hex) {
        let color
        if (opacity) color = new Color(hex, opacity)
        else color = new Color(hex)

        const name = `${colorName}號色 ${toColorDescName(hex, opacity)} - ${description}`

        const oldColor = allAssetsColors[colorName]
        if (oldColor) {
          let oldColorKey

          if (oldColor.color instanceof Color) {
            oldColorKey = colorToKey(oldColor.color)
            if (colorToKey(color) === oldColorKey) continue
          } else {
            oldColorKey = gradientLinearToKey(oldColor)
          }

          sameColorMap.set(oldColorKey, color)
          deleteColors.push(oldColor)
        }

        addColors.push({
          name,
          color,
        })
      } else if (gradientType) {
        const ascStopColorStops = colorStops.sort((a, b) => a.stop - b.stop)

        const gradient = new LinearGradient()

        gradient.colorStops = ascStopColorStops.map(({ stop, hex, opacity }) => ({
          stop,
          color: opacity != null ? new Color(hex, opacity) : new Color(hex),
        }))

        const name = `${colorName}號色 ${ascStopColorStops.map(e => toColorDescName(e.hex, e.opacity)).join(' - ')} - ${description}`

        const oldColor = allAssetsColors[colorName]
        if (oldColor) {
          let oldColorKey

          if (oldColor.color instanceof Color) {
            oldColorKey = colorToKey(oldColor.color)
          } else {
            oldColorKey = gradientLinearToKey(oldColor)
            if (gradientLinearToKey(gradient) === oldColorKey) continue
          }

          sameColorMap.set(oldColorKey, gradient)
          deleteColors.push(oldColor)
        }

        addColors.push({
          name,
          gradientType,
          colorStops: gradient.colorStops,
        })
      }
    }
  } catch (error) {
    showAlert(`顏色匹配過程出現錯誤 (${error.message})`)
    console.error(error)
    return
  }

  try {
    recursiveUpdateChildColorByImport(documentRoot, sameColorMap)

    deleteColors.forEach(color => {
      assets.colors.delete(color)
    })

    if (addColors.length) {
      console.log(`已新增或調整了 ${assets.colors.add(addColors)} 筆色號`)
    }
  } catch (error) {
    showAlert(`元素顏色轉換時出現錯誤 (${error.message})`)
    console.error(error)
  }
}

function recursiveUpdateChildColorByImport (node, sameColorMap) {
  node.children.forEach(e => {
    if (e instanceof SymbolInstance) return
    if (e.isContainer) return recursiveUpdateChildColorByImport(e, sameColorMap)

    if (e.fill != null) {
      if (e.fill instanceof Color) {
        const newColor = sameColorMap.get(colorToKey(e.fill))
        if (newColor) e.fill = newColor
      } else if (e.fill instanceof LinearGradient || e.fill instanceof RadialGradient) {
        const newColor = sameColorMap.get(gradientLinearToKey(e.fill))
        if (newColor) {
          if (newColor instanceof Color) {
            e.fill = newColor
          } else {
            const newGradient = e.fill.clone()
            newGradient.colorStops = newColor.colorStops
            e.fill = newGradient
          }
        }
      }
    }

    if (e.stroke != null) {
      if (e.stroke instanceof Color) {
        const newColor = sameColorMap.get(colorToKey(e.stroke))
        if (newColor) e.stroke = newColor
      }
    }

    recursiveUpdateChildColorByImport(e, sameColorMap)
  })
}

function gradientLinearToKey (color) {
  return color.colorStops.map(e => `${colorToKey(e.color)}${e.stop}`).join('')
}

function colorToKey (color) {
  return `${color.toHex(true).toLowerCase()}${color.a ? color.a : 255}`
}

function toColorDescName (hex, opacity) {
  return `${hex}${opacity ? `(${opacity * 100}%)` : ''}`
}

async function exportAssetsColors () {
  /** @type {import('./type/common.d.ts').AssetsColor[]} */
  const allAssetsColors = assets.colors.get()

  if (!allAssetsColors.length) {
    showAlert('assets 沒有任一顏色，請嘗試添加顏色以導出顏色配置')
    return
  }

  const exportDataList = []

  allAssetsColors.forEach(e => {
    const [_, colorName, afterText, dash, desc] = e.name?.match(/^([A-z]+\d+)(.+(\s-\s)(.*)$)?/) || []
    if (!colorName) return

    const description = desc || afterText || e.name

    if (e.color instanceof Color) {
      const data = {
        colorName,
        description,
        hex: e.color.toHex(true),
      }
      if (e.color.a && e.color.a !== 255) data.opacity = alphaToPercentage(e.color.a) / 100
      exportDataList.push(data)
    } else if (e.gradientType) {
      const data = {
        colorName,
        description,
        gradientType: e.gradientType,
        colorStops: e.colorStops.map(f => {
          const color = {
            stop: f.stop,
            hex: f.color.toHex(true),
          }
          if (f.color.a && f.color.a !== 255) color.opacity = alphaToPercentage(f.color.a) / 100
          return color
        })
      }
      exportDataList.push(data)
    }
  })

  const currentDate = new Date()
  let filename = 'xd_assets_colors_'

  filename += currentDate.getFullYear()
  filename += (currentDate.getMonth() + 1).toString().padStart(2, '0')
  filename += currentDate.getDate().toString().padStart(2, '0')

  const file = await fs.getFileForSaving(`${filename}.json`)
  if (file) {
    const resultJsonString = stringify(sortColorNameList(exportDataList, {
      transformElement: e => e.colorName
    }).reduce((p, { colorName, ...other }) => {
      p[colorName] = other
      return p
    }, {}), { maxLength: 60 })

    await file.write(resultJsonString)
  }
}

function copyUnoAssetsColors() {
  /** @type {import('./type/common.d.ts').AssetsColor[]} */
  const allAssetsColors = assets.colors.get()

  if (!allAssetsColors.length) {
    showAlert('assets 沒有任一顏色，嘗試添加顏色以嘗試複製功能')
    return
  }

  const copyTextList = []

  allAssetsColors.forEach(({
    name,
    color,
    gradientType,
    colorStops,
  }) => {
    const [, colorName] = name?.match(/^([A-z]+\d+).*$/) || []
    if (!colorName) return

    if (color) {
      copyTextList.push(`${colorName}: ${toUnoColorValue(color)}, // ${name}`)
    } else if (gradientType) {
      colorStops.forEach((f, i) => {
        const { color } = f
        copyTextList.push(`${colorName}_${i + 1}: ${toUnoColorValue(color)}, // ${name}`)
      })
    }
  })

  if (!copyTextList.length) {
    showAlert('未匹配到任何可以複製的顏色！')
    return
  }

  const colorText = sortColorNameList(copyTextList).join('\n  ')

  clipboard.copyText(`{
  ${colorText}
}`)

  showAlert('顏色已成功複製到剪貼簿！')
}

function toUnoColorValue (color) {
  const hexColor = color.toHex(true)
  if (!color.a || color.a === 255) return `'${hexColor}'`
  return `rgba('${hexColor}', ${alphaToPercentage(color.a) / 100})`
}

function drawAssetsColors (selection, documentRoot) {
  const space = 100
  let minX = 0, minY = 0

  documentRoot.children.forEach(e => {
    const { x, y, width, height } = e.globalBounds
    if (x < minX) minX = x
    if (y < minY) minY = y
  })

  const artboard = new Artboard()
  let width = 500, height = 500

  artboard.name = '色塊圖'
  artboard.fill = new Color('#ffffff')
  artboard.moveInParentCoordinates(minX - space - width, minY)
  artboard.width = width
  artboard.height = height

  documentRoot.addChild(artboard)
}

let configPanelDom, configPanelApp
let _ddd
function showPanelConfig (event) {
  /** @type {import('./type/common.d.ts').AssetsColor[]} */
  const allAssetsColors = sortColorNameList(assets.colors.get(), {
    transformElement: e => e.name || 'a00', // !name 就名字隨意讓裡面取得到職判斷就好
  })
  /** @desc key 為 colorName */
  /** @type {import('./type/common.d.ts').AllAssetsColors} */
  const allAssetsColorsMap = new Map()
  /** @type {import('./type/common.d.ts').ColorGroupItem[]} */
  const defaultGroupList = [
    { name: '未分類', colorNameList: [] },
  ]

  allAssetsColors.forEach((e) => {
    const {
      name,
      color,
      gradientType,
      colorStops,
    } = e

    const [, colorName] = name?.match(/^([A-z]+\d+).*$/) || []
    if (!colorName) return
    if (color instanceof Color) {
      const { r, g, b, a } = color.toRgba()
      const percentAlpha = alphaToPercentage(a) / 100
      allAssetsColorsMap.set(colorName, {
        colorName,
        origin: e,
        shouldBlackText: shouldUseBlackText(r, g, b, percentAlpha),
        colorCss: `rgba(${r}, ${g}, ${b}, ${percentAlpha})`,
      })
    } else if (gradientType) {
      const shouldBlackTextCheckGradientStops = []
      let colorCss = gradientType === 'linear' ? 'linear-gradient(to bottom' : 'radial-gradient(circle at center'

      colorStops.forEach(({ stop, color }) => {
        const percentAlphaColor = color.toRgba()
        const percentAlpha = alphaToPercentage(percentAlphaColor.a)
        percentAlphaColor.a = percentAlpha / 100

        shouldBlackTextCheckGradientStops.push({
          stop,
          color: percentAlphaColor,
        })

        colorCss += `, rgba(${percentAlphaColor.r}, ${percentAlphaColor.g}, ${percentAlphaColor.b}, ${percentAlphaColor.a}) ${stop * 100}%`
      })

      allAssetsColorsMap.set(colorName, {
        colorName,
        origin: e,
        shouldBlackText: shouldUseBlackTextForGradient(shouldBlackTextCheckGradientStops),
        colorCss: colorCss + ')',
        gradientType,
      })
    }
    defaultGroupList[0].colorNameList.push(colorName)
  })

  if (configPanelDom) {
    configPanelApp._data.groupList = defaultGroupList
    return
  }

  /** @type {import('./type/vue2/vue.js').Vue} */
  const Vue = require('./lib/vue@2.7.16.min.cjs')
  require('./component/vue/color-item.js')(Vue)
  const { name: documentFilename, guid: documentGuid } = application.activeDocument

  configPanelDom = document.createElement('div')
  configPanelDom.innerHTML = '<div id="config-panel"></div>'
  event.node.appendChild(configPanelDom)

  const storageName = name => `${documentGuid}_config_panel_${name}`
  const storage = {
    groupList: createValueStorage(storageName('group_list_v5'), defaultGroupList),
  }
  const vueData = {
    /** @type {import('./type/common.d.ts').SelectedXdItem[]} */
    selectedXdItemList: null,
    isCreatingGroup: false,
    inputGroupName: '',
    /** @type {import('./type/common.d.ts').ColorGroupItem[]} */
    groupList: defaultGroupList,
    // groupList: storage.groupList.defaultValue,
    /** @type {Map<string, true>} */
    collapsedGroupNameMap: new Map(),
  }

  vueData.groupList.forEach(e => {
    vueData.collapsedGroupNameMap.set(e.name, true)
  })

  configPanelApp = Vue.prototype.$cpApp = new Vue({
    el: '#config-panel',
    data: vueData,
    render(h) {
      /** @type {typeof vueData} */
      const vm = this
      const basePL = 8
      const basePR = 8
      const baseLabelStyle = { style: { fontSize: 12, paddingLeft: basePL } }

      return h('div', { class: 'bel-app-scroll-view', style: { height: 'calc(100vh - 210px)', overflowY: 'auto' } }, [
        // h(
        //   'select',
        //   {
        //     attrs: { name: 'color-name' },
        //     domProps: { value: vm.selectOptionValue },
        //     on: {
        //       change(event) {
        //         vm.selectOptionValue = event.target.selectOptionValue
        //       },
        //     },
        //   },
        //   [
        //     vm.options.map(e => {
        //       const [, colorName] = e.name?.match(/^([A-z]+\d+).*$/) || []
        //       return h('option', { attrs: { value: colorName } }, e.name)
        //     })
        //   ]
        // ),
        h(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: basePR } },
          [
            h('div', baseLabelStyle, '顏色群組'),
            // h(
            //   'div',
            //   {
            //     style: { fontSize: 18, fontWeight: 700, cursor: 'pointer' },
            //     on: {
            //       click() {
            //         vm.isCreatingGroup = !vm.isCreatingGroup
            //         if (vm.isCreatingGroup) vm.inputGroupName = ''
            //       }
            //     }
            //   },
            //   vm.isCreatingGroup ? 'x' : '+'
            // ),
          ],
        ),
        vm.isCreatingGroup && h(
          'input',
          {
            attrs: { placeholder: '請輸入要新增的群組名稱' },
            domProps: { type: vm.inputGroupName },
            on: {
              input(event) {
                vm.inputGroupName = event.target.value
              },
              keydown(event) {
                if (!(event.key === 'Enter' || event.keyCode === 13)) return

                if (vm.groupList.some(e => e.name === vm.inputGroupName)) {
                  showAlert('已存在該群組，請嘗試替換其他群組名')
                  return
                }

                const newGroupList = [
                  ...vm.groupList,
                  {
                    name: vm.inputGroupName,
                    colorNameList: [],
                  },
                ]
                updateVueStorageData(vm, storage, 'groupList', newGroupList)
                vm.isCreatingGroup = false
                vm.inputGroupName = ''
              },
            }
          },
        ),
        vm.groupList.length > 0 && h('hr'),
        h(
          'div',
          [
            vm.groupList.map(({ name, colorNameList }) => {
              const isCollapsed = vm.collapsedGroupNameMap.get(name)

              return h(
                'div',
                [
                  // group label
                  h(
                    'div',
                    { style: { display: 'flex', alignItems: 'center', paddingLeft: basePL, paddingTop: 4, paddingBottom: 4 } },
                    [
                      h(
                        'div',
                        {
                          style: { cursor: 'pointer', fontWeight: 700, marginRight: 4 },
                          on: {
                            click() {
                              if (isCollapsed) vm.collapsedGroupNameMap.delete(name)
                              else vm.collapsedGroupNameMap.set(name, true)

                              vm.collapsedGroupNameMap = new Map(vm.collapsedGroupNameMap)
                            },
                          },
                        },
                        // isCollapsed ? '-' : '+'
                        h('img', { attrs: { src: './img/chevron_right_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg' } })
                      ),
                      h('div', { style: { fontSize: 12 } }, name),
                    ]
                  ),
                  // group 顏色列表
                  isCollapsed && !!colorNameList?.length && h(
                    'div',
                    { style: { display: 'flex', flexWrap: 'wrap', padding: '0 4px' } },
                    colorNameList.map(colorName => h('color-item', { props: { allAssetsColorsItem: allAssetsColorsMap.get(colorName) } }))
                  )
                ],
              )
            }),
          ]
        ),
      ])
    }
  })
}

function updatePanelConfig (selection, documentRoot) {
  if (configPanelApp && configPanelApp._data) {
    configPanelApp._data.selectedXdItemList = !!selection?.items.length ? selection.items : []
  }

  _ddd = documentRoot
}

module.exports = {
  panels: {
    panelConfig: {
      show: showPanelConfig,
      update: updatePanelConfig,
    },
  },
  commands: {
    copyUnoAssetsColors,
    importAssetsColors,
    exportAssetsColors,
    drawAssetsColors,
  },
}
