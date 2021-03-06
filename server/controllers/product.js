import db from '../db/models';
import fs from 'fs';
import { paginate, productPerPage, filterWhere } from '../utils';

const { Product, Shop, Review, Auth, Order, OrderItem, Category } = db;

class ProductCtrl {

  /**
   * 
   * @description
   * Controller method to get all products in the DB
   * 
   * @param { Object } req 
   * @param { Object } res 
   */
  static getAll(req, res) {
    let { page, filter, query } = req.query;

    // parse filter
    try{ filter = JSON.parse(filter); }
    catch(e) { filter = {} }

    page = parseInt(page);
    page = typeof page == 'number' && page > 0 ? page : 1;
    const offset = productPerPage * (page - 1);

    query = typeof query == 'string' && query.trim().length > 0
      ? query.trim()
      : null;

    const where = { ...filterWhere(filter) };
    
    if(query) where.title = {
      $iLike: `%${query}%`
    }
    
    Product.findAndCountAll({
      where,
      limit: productPerPage,
      offset
    })
      .then((result) => {
        const products = result.rows;
        const total = result.count;
        const pagination = paginate(total, productPerPage, page);

        res.status(200).json({
          message: 'Products fetched successfully',
          products,
          pagination
        });
      })
      .catch(() => {
        res.status(500).json({
          message: 'Error occured while fetching products',
        });
      });
  }

  static getByCategory(req, res) {
    let { page, filter, query } = req.query;

    query = typeof query == 'string' && query.trim().length > 0
    ? query.trim()
    : null;

    // parse filter
    try{ filter = JSON.parse(filter);}
    catch(e) { filter = {}}

    page = parseInt(page);
    page = typeof page == 'number' && page > 0 ? page : 1;
    const offset = productPerPage * (page - 1);
    const { categoryId } = req.params;

    Category.findOne({ where: { id: categoryId }})
      .then(category => {
        if(!category) {
          return res.status(400).json({
            message: 'Category does not exist',
          });
        }

        const where = { categoryId, ...filterWhere(filter) };
  
        if(query) where.title = {
          $iLike: `%${query}%`
        }
  
        return Product.findAndCountAll({
          where,
          limit: productPerPage,
          offset
        })
          .then((result) => {
            const products = result.rows;
            const total = result.count;
            const pagination = paginate(total, productPerPage, page);

            res.status(200).json({
              message: 'Products fetched successfully',
              products,
              pagination
            });
          })
          .catch(() => {
            res.status(500).json({
              message: 'Error occured while fetching products',
            });
          });
      })
      .catch(() => {
        res.status(500).json({
          message: 'Error occured while fetching category',
        });
      });
  }

  /**
   * 
   * @description
   * A plain function to abstract common request body data validation
   * code for both add and edit product controller methods
   * 
   * @param { Object } res 
   * @param { Object } entry 
   * @param { String } password 
   * 
   * @returns { true | false }
   */
  static validateProduct(res, title, price, shopId, categoryId, imageFile) {
    console.log('\n\n\n');
    console.log(price);

    if (!shopId || !`${shopId}`.match(/^[0-9]+$/)) {
      res.status(400).json({
        message: "Invalid shopId",
      });
  
      return false;
    }

    if (!categoryId || !`${categoryId}`.match(/^[0-9]+$/)) {
      res.status(400).json({
        message: "Select a category",
      });
  
      return false;
    }


    if (!title || title.trim().length === 0) {
      res.status(400).json({
        message: 'Title provided is invalid',
      });
      return false;
    }

    else if (typeof price != 'number' && !(typeof price == 'string' && price.match(/^[1-9][0-9]*$/))) {
      res.status(400).json({
        message: 'Price provided is invalid',
      });
      return false;
    }

    else if (imageFile !== false && !imageFile) {
      res.status(400).json({
        message: 'Image provided is invalid',
      });
      return false;
    }

    return true;
  }

  static vendorAccessShop(res, vendorId, shopId) {
    return Shop.findOne({
      where: { vendorId, id: shopId }
    })
      .then((shop) => {
        if (!shop) {
          res.status(403).json({
            message: 'Vendor has no access to shop',
          });
        } else {
          return true;
        }
      })
      .catch(() => {
        res.status(500).json({
          message: 'Error occured while getting vendor shop',
        });
      });
  }

  /**
   * 
   * @description
   * Controller method to add product to the Products DB table
   * This endpoint expect for product details (title, price and image)
   * to be passed as the request body accessible through req.body object
   * 
   * @param { Object } req 
   * @param { Object } res 
   */
  static addProduct(req, res) {
    let { id } = req.payload;
    let { title, price, shopId, categoryId } = req.body;
    const imageFile = req.file;
    // runs the validation function and run the below code
    // if validation was successfull
    if (ProductCtrl.validateProduct(res, title, price, shopId, categoryId, imageFile)) {
      ProductCtrl.vendorAccessShop(res, id, shopId)
        .then((status) => {
          if (status !== true ) return;

          title = title.trim();
          price = parseInt(price);

          // check if product already exist by checking the Products table
          // for entry with the provided title in a case insensitive manner. 
          Product.findOne({
            where: {
              shopId,
              title: {
                $ilike: title
              }
            }
          })
            .then((product) => {
              if(product) {
                res.status(409).json({
                  message: 'Product with this title already exist',
                });
              } else {
                Product.create({
                  title,
                  price,
                  image: imageFile.path.substring(6),
                  shopId,
                  categoryId
                })
                  .then((product) => {
                    res.status(201).json({
                      message: 'Product added successfully',
                      product
                    });
                  })
                  .catch(error => {
                    res.status(500).json({
                      message: 'Internal server error',
                      error
                    });
                  });
              }
            })
            .catch((error) => {
              res.status(500).json({
                message: 'Internal server error',
                error
              });
            });
        });
    }
  }

  /**
   * 
   * @description
   * Controller method to edit product in the Products DB table
   * This endpoint expect for product details (title, price and image)
   * to be passed as the request body accessible through req.body object
   * 
   * @param { Object } req 
   * @param { Object } res 
   */
  static editProduct(req, res) {
    let { id } = req.payload;
    let { title, price, shopId, categoryId } = req.body;
    const { productId } = req.params;

    // runs the validation function and run the below code
    // if validation was successfull
    if (ProductCtrl.validateProduct(res, title, price, shopId, categoryId, false)) {
      ProductCtrl.vendorAccessShop(res, id, shopId)
        .then((status) => {
          if (status !== true ) return;

          title = title.trim();
          price = parseInt(price);

          // check if product actually exist before trying to update it
          Product.findOne({
            where: {
              id: productId,
              shopId
            }
          })
            .then((product) => {
              // if product is found, update the product details and save
              if(product) {
                product.title = title;
                product.price = price;
                product.categoryId = categoryId;

                if(req.file) {
                  const filepath = 'public/' + product.image;
        
                  if(fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                  }
                  product.image = req.file.path.substring(6);
                }
              
                product.save();

                res.status(200).json({
                  message: 'Product updated successfully',
                  product
                });
              } else {
                res.status(404).json({
                  message: 'Product does not exist',
                });
              }
            })
            .catch((error) => {
              res.status(500).json({
                message: 'Error occured while updating product',
                error
              });
            });
        })
    }
  }

  /**
   * 
   * @description
   * Controller method to delete a product from the Products DB table
   * This endpoint expect that the productId to be deleted should be passed
   * as params, that is via the request url and accessible here through the
   * req.params object.
   * 
   * @param { Object } req 
   * @param { Object } res 
   */
  static deleteProduct(req, res) {
    let { id } = req.payload;
    const { productId } = req.params;

    // confirm that the product actually exist in the Products table
    // before trying to delete it.
    Product.findOne({
      where: {
        id: productId
      }
    })
      .then((product) => {
        if (product) {
          ProductCtrl.vendorAccessShop(res, id, product.shopId)
            .then((status) => {
              if (status !== true ) return;
              product.destroy();

              res.status(200).json({
                message: 'Product deleted successfully',
                productId
              });
            })
        } else {
          res.status(404).json({
            message: 'Product does not exist'
          });
        }
      })
      .catch((error) => {
        res.status(500).json({
          message: 'Error occured while deleting product',
          error
        });
      });
  }

  static checkIfPurchasedProduct(customerId, productId) {
    // Fetch all orders for a customer
    return Order.findAll({
      where: {
        customerId
      }
    })
      .then(orders => {
        if (!orders) return false;

        const orderIds = orders.map(order => order.id);

        return OrderItem.findOne({
          where: {
            orderId: orderIds,
            productId
          }
        })
          .then((orderItem) => !!orderItem)
          .catch(() => false);
      })
      .catch(() => false);
  }

  /**
   * 
   * @description
   * Controller method to fetch a particular product details from the
   * Products DB table, this endpoint expect that the productId to be
   * fetch should be passed as params, that is via the request url and
   * accessible here through the req.params object.
   * 
   * @param { Object } req 
   * @param { Object } res 
   */
  static getProduct(req, res) {
    const { productId } = req.params;
    const customerId = req.payload ? req.payload.id : null;

    // Find the product in the product table
    Product.findOne({
      where: {
        id: productId,
      },
      include: [
        {
          model: Shop,
          attributes: [ 'name' ]
        },
        {
          model: Review,
          include: [{
            model: Auth,
            attributes: ['email']
          }
      ]
      }]
    })
      .then((product) => {
        if (product) {
          // Check if customer already has a review posted and
          // set canPostReview appropriately
          Review.findOne({
            where: {
              customerId,
              productId
            }
          })
            .then(review => {
              if (review) {
                return res.status(200).json({
                  message: 'Product fetched successfully',
                  product: { ...product.dataValues, canPostReview: false }
                });
              }

              ProductCtrl.checkIfPurchasedProduct(customerId, productId)
                .then(status => {
                  res.status(200).json({
                    message: 'Product fetched successfully',
                    product: { ...product.dataValues, canPostReview: status }
                  });
                })
                .catch(() => {
                  res.status(500).json({
                    message: 'Error occured while getting product details'
                  });
                });
            })
            .catch(() => {
              res.status(500).json({
                message: 'Error occured while checking review'
              });
            });
        } else {
          res.status(404).json({
            message: 'Product does not exist'
          });
        }
      })
      .catch(() => {
        res.status(500).json({
          message: 'Error occured while getting product details'
        });
      });
  }

  // static removeFromCategory(req, res) {
  //   const { productId } = req.params;

  //   Product.findOne({
  //     where: {
  //       id: productId,
  //     }
  //   })
  //     .then(product => {
  //       if(!product) {
  //         return res.status(404).json({
  //           message: 'Product not found'
  //         });
  //       } else {

  //       product.categoryId = null;
  //       product.save();

  //       return res.status(200).json({
  //         message: 'Product removed from category'
  //       });
  //     }
  //     })
  //     .catch(() => {
  //       res.status(500).json({
  //         message: 'Error occured while getting product'
  //       });
  //     });
  // }
 }

export default ProductCtrl;
