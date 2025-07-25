import {type FunctionalComponent, h} from 'vue'
import type {DataTableColumns} from 'naive-ui'
import {NDataTable, NButton, useMessage} from 'naive-ui'

const NaiveUiTableTsx: FunctionalComponent = () => {
  interface Song {
    no: number
    title: string
    length: string
  }

  function createColumns(
    {
      play
    }: {
      play: (row: Song) => void
    }): DataTableColumns<Song> {
    return [
      {
        title: 'No',
        key: 'no'
      },
      {
        title: 'Title',
        key: 'title'
      },
      {
        title: 'Length',
        key: 'length'
      },
      {
        title: 'Action',
        key: 'actions',
        render(row) {
          return h(
            NButton,
            {
              strong: true,
              tertiary: true,
              size: 'small',
              onClick: () => play(row)
            },
            {default: () => 'Play'}
          )
        }
      }
    ]
  }

  const data: Song[] = [
    {no: 3, title: 'Wonderwall', length: '4:18'},
    {no: 4, title: 'Don\'t Look Back in Anger', length: '4:48'},
    {no: 12, title: 'Champagne Supernova', length: '7:27'}
  ]

  const message = useMessage()
  const columns = createColumns({
    play(row) {
      message.info(`Play ${row.title}`)
    }
  })
  let pagination = false

  return (
    <NDataTable
      columns={columns}
      data={data}
      pagination={pagination}
      bordered={false}
    />
  )
}

export default NaiveUiTableTsx