import express from 'express'
import * as bodyParser from 'body-parser'
import 'dotenv/config'

class App {
  public app: express.Application

  constructor() {
    this.app = express()
    this.config()
  }

  private config(): void {
    this.app.use(bodyParser.urlencoded({ extended: false }))
  }
}

export default new App().app
