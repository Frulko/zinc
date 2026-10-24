#include <cstdint>
#include <cstdlib>

#include <psp2/kernel/clib.h>

extern "C"
{
    // These are defined in shacccg_ext.c
    void *_sceShaccCgHeapAlloc(size_t size);
    void _sceShaccCgHeapFree(void *ptr);
    extern void (*_AtomicIncrement)(uint32_t *);
    extern uint32_t (*_AtomicDecrement)(uint32_t *);
}

/**
 * 
 * The Red-Black tree implementation used was taken from here:
 * https://github.com/Dynmi/RedBlackTree
 * 
 */

namespace // Unnamed namespace
{
    enum Color : std::uint8_t
    {
        RED,
        BLACK
    };

    class Allocatable
    {
    public:
        Allocatable() = default;
        void *operator new(std::size_t size)
        {
            return _sceShaccCgHeapAlloc(size);
        }

        void operator delete(void *ptr)
        {
            _sceShaccCgHeapFree(ptr);
        }
    };

    template <typename KeyType>
    class set : public Allocatable
    {
    public:
        struct node : public Allocatable
        {
            node() : left(this), parent(this), right(this), color(RED), nil(false) {}
            node(node *invalid) : left(invalid), parent(invalid), right(invalid), color(RED), nil(false) {}
            node(KeyType k) : left(this), parent(this), right(this), key(k), color(RED), nil(false) {}
            node(KeyType k, node *invalid) : left(invalid), parent(invalid), right(invalid), key(k), color(RED), nil(false) {}
            ~node()
            {
                if (left != nullptr && left->nil == false)
                    delete left;
                if (right != nullptr && right->nil == false)
                    delete right;
            }

            node *left;
            node *parent;
            node *right;
            KeyType key;
            Color color;
            bool nil;
        };

    public:
        std::uint32_t unk_0x0;
        node *rootParent;   // Parent of the root variable
        std::uint32_t size; // Number of nodes under the root parent.

        set() : unk_0x0(0), rootParent(new node()), size(0)
        {
            rootParent->color = BLACK;
            rootParent->nil = true;
        }
        ~set()
        {
            if (rootParent->parent != rootParent)
                delete rootParent->parent;

            delete rootParent;
        }
        set(set<KeyType> &s) : size(0)
        {
            node *sRoot;
            rootParent = new set<KeyType>::node();
            rootParent->color = BLACK;
            rootParent->nil = true;

            sRoot = s.rootParent->parent;

            if (!sRoot->nil)
            {
                copyNode(sRoot);
            }
        }

        void copyNode(node *node)
        {
            insert(node->key);

            if (!node->left->nil)
            {
                copyNode(node->left);
            }
            if (!node->right->nil)
            {
                copyNode(node->right);
            }
        }

        int cmp(const KeyType &a, const KeyType &b) const
        {
            if (a < b)
                return 0;
            else
                return 1;
        }

        void leftRotate(node *node)
        {
            auto temp = node->right;

            // update the two nodes
            node->right = temp->left;
            if (temp->left != this->invalidNode())
                temp->left->parent = node;
            temp->left = node;
            temp->parent = node->parent;
            node->parent = temp;

            // update the parent
            if (rootParent->parent == node)
            {
                rootParent->parent = temp;
                return;
            }
            if (temp->parent->left == node)
                temp->parent->left = temp;
            else
                temp->parent->right = temp;
        }

        void rightRotate(node *node)
        {
            auto temp = node->left;

            // update the two nodes
            node->left = temp->right;
            if (temp->right != this->invalidNode())
                temp->right->parent = node;
            temp->right = node;
            temp->parent = node->parent;
            node->parent = temp;

            // update the parent
            if (rootParent->parent == node)
            {
                rootParent->parent = temp;
                return;
            }
            if (temp->parent->left == node)
                temp->parent->left = temp;
            else
                temp->parent->right = temp;
        }

        void removeNode(node *node)
        {

            if (node->color == RED)
            {
                if (node->left != this->invalidNode() && node->right != this->invalidNode())
                {
                    // child x 2
                    // find successor, then fill 'node' with successor
                    auto successor = node->right;
                    while (successor->left != this->invalidNode())
                        successor = successor->left;
                    node->key = successor->key;
                    this->removeNode(successor);
                }
                else if (node->left != this->invalidNode())
                {
                    // only left child
                    // fill 'node' with left child
                    node->key = node->left->key;
                    node->color = node->left->color;
                    this->removeNode(node->left);
                }
                else if (node->right != this->invalidNode())
                {
                    // only right child
                    // fill 'node' with right child
                    node->key = node->right->key;
                    node->color = node->right->color;
                    this->removeNode(node->right);
                }
                else
                {
                    // no child
                    if (node->parent == this->invalidNode())
                    {
                        delete node;
                        rootParent->parent = rootParent;
                        rootParent->left = rootParent;
                        rootParent->right = rootParent;
                        return;
                    }

                    if (node->parent->left == node)
                        node->parent->left = invalidNode();
                    else
                        node->parent->right = invalidNode();

                    delete node;
                }
            }
            else
            {
                if (node->left != this->invalidNode() && node->right != this->invalidNode())
                {
                    // child x 2
                    // find successor, then fill 'node' with successor
                    auto successor = node->right;
                    while (successor->left != this->invalidNode())
                        successor = successor->left;
                    node->key = successor->key;
                    this->removeNode(successor);
                }
                else if (node->left != this->invalidNode())
                {
                    // only left child
                    // fill 'node' with left child
                    node->key = node->left->key;
                    this->removeNode(node->left);
                }
                else if (node->right != this->invalidNode())
                {
                    // only right child
                    // fill 'node' with right child
                    node->key = node->right->key;
                    this->removeNode(node->right);
                }
                else
                {
                    // no child. As the black node deleted is a leaf, fixup
                    // is neccesary after delete.

                    if (node->parent == this->invalidNode())
                    {
                        // 'node' is root
                        delete node;
                        rootParent->parent = rootParent;
                        rootParent->left = rootParent;
                        rootParent->right = rootParent;
                        return;
                    }

                    if (node->parent->left == node)
                    {
                        node->parent->left = invalidNode();
                        if (node->parent->right != this->invalidNode() && node->parent->right->color == RED)
                        {
                            node->parent->right->color = BLACK;
                            leftRotate(node->parent);
                        }
                    }
                    else
                    {
                        node->parent->right = invalidNode();
                        if (node->parent->left != this->invalidNode() && node->parent->left->color == RED)
                        {
                            node->parent->left->color = BLACK;
                            rightRotate(node->parent);
                        }
                    }

                    if (node->parent->left == this->invalidNode() && node->parent->right == this->invalidNode() && node->parent->parent != this->invalidNode())
                    {
                        // you can guess, 'node->parent->parent' must be RED
                        rightRotate(node->parent->parent);
                    }

                    delete node;
                }
            }
        }

        node *insert(KeyType key)
        {
            node *newNode;
            node *node = search(key);
            if (node != nullptr)
                return node;

            newNode = node = new set<KeyType>::node(this->invalidNode());
            node->key = key;

            // whether first node
            if (rootParent->parent == rootParent)
            {
                rootParent->left = node;
                rootParent->right = node;
                rootParent->parent = node;
                node->parent = rootParent;
                node->color = BLACK;
                return node;
            }

            // navigate to the desired positon of new node
            set<KeyType>::node *curr = rootParent->left;
            while ((curr->left != this->invalidNode()) | (curr->right != this->invalidNode()))
            {
                if (cmp(key, curr->key) == 0)
                {
                    if (curr->left->nil)
                        break;
                    curr = curr->left;
                }
                else
                {
                    if (curr->right->nil)
                        break;
                    curr = curr->right;
                }
            }

            // link new node and its parent
            node->parent = curr;
            if (cmp(key, curr->key) == 0)
            {
                curr->left = node;
                if (curr == rootParent->left)
                    rootParent->left = node;
            }
            else
            {
                curr->right = node;
                if (curr == rootParent->right)
                    rootParent->right = node;
            }

            // update the tree recursively to keep its properties if needed
            while (curr->color == RED && curr->parent != this->invalidNode())
            {
                bool isRight = (curr == curr->parent->right);
                set<KeyType>::node *uncle;
                if (isRight)
                    uncle = curr->parent->left;
                else
                    uncle = curr->parent->right;

                if (uncle == this->invalidNode())
                {
                    curr->color = BLACK;
                    curr->parent->color = RED;
                    if (uncle == curr->parent->right)
                    {
                        rightRotate(curr->parent);
                    }
                    else
                    {
                        leftRotate(curr->parent);
                    }
                    break;
                }
                else if (uncle->color == RED)
                {
                    curr->color = BLACK;
                    uncle->color = BLACK;
                    curr->parent->color = RED;
                    curr = curr->parent;
                }
                else
                {
                    curr->color = BLACK;
                    curr->parent->color = RED;

                    if (isRight)
                    {
                        if (node == curr->left)
                        {
                            rightRotate(curr);
                            curr = node;
                        }
                        leftRotate(curr->parent);
                    }
                    else
                    {
                        if (node == curr->right)
                        {
                            leftRotate(curr);
                            curr = node;
                        }
                        rightRotate(curr->parent);
                    }
                }
                rootParent->parent->color = BLACK;
            }

            this->size++;

            return newNode;
        }

        bool remove(const KeyType &key)
        {
            // find the node to be deleted
            auto curr = rootParent->parent;
            while ((curr->left != this->invalidNode()) | (curr->right != this->invalidNode()))
            {
                if (curr->key == key)
                    break;

                if (cmp(key, curr->key) == 1)
                {
                    if (curr->right->nil)
                        break;
                    curr = curr->right;
                }
                else
                {
                    if (curr->left->nil)
                        break;
                    curr = curr->left;
                }
            }
            if (curr->key != key)
                return 0;

            this->removeNode(curr);
            (this->size)--;
            return 1;
        }

        node *search(const KeyType &key) const
        {
            auto curr = rootParent->parent;
            while ((curr->left != this->invalidNode()) | (curr->right != this->invalidNode()))
            {
                if (curr->key == key)
                {
                    break;
                }

                if (cmp(key, curr->key) == 0)
                {
                    if (curr->left->nil)
                        break;
                    curr = curr->left;
                }
                else
                {
                    if (curr->right->nil)
                        break;
                    curr = curr->right;
                }
            }

            if (curr->nil || (curr->key != key))
                return nullptr;
            return curr;
        }

        int getSize() const
        {
            return size;
        }

        node *invalidNode() const
        {
            return rootParent;
        }
    };

    template <typename KeyType, typename ValueType>
    class map : public Allocatable
    {
    public:
        struct node : public Allocatable
        {
            node() : left(this), parent(this), right(this), color(RED), nil(false) {}
            node(node *invalid) : left(invalid), parent(invalid), right(invalid), color(RED), nil(false) {}
            node(KeyType k) : left(this), parent(this), right(this), key(k), color(RED), nil(false) {}
            node(KeyType k, node *invalid) : left(invalid), parent(invalid), right(invalid), key(k), color(RED), nil(false) {}
            ~node()
            {
                if (left != nullptr && left->nil == false)
                    delete left;
                if (right != nullptr && right->nil == false)
                    delete right;
            }

            node *left;
            node *parent;
            node *right;
            KeyType key;
            ValueType value;
            Color color;
            bool nil;
        };

    public:
        std::uint32_t unk_0x0;
        node *rootParent;   // Parent of the root variable
        std::uint32_t size; // Number of nodes under the root parent.

        map() : unk_0x0(0), rootParent(new node()), size(0) {}
        ~map()
        {
        }

        int cmp(const KeyType &a, const KeyType &b) const
        {
            if (a < b)
                return 0;
            else
                return 1;
        }

        void leftRotate(node *node)
        {
            auto temp = node->right;

            // update the two nodes
            node->right = temp->left;
            if (temp->left != this->invalidNode())
                temp->left->parent = node;
            temp->left = node;
            temp->parent = node->parent;
            node->parent = temp;

            // update the parent
            if (rootParent->parent == node)
            {
                rootParent->parent = temp;
                return;
            }
            if (temp->parent->left == node)
                temp->parent->left = temp;
            else
                temp->parent->right = temp;
        }

        void rightRotate(node *node)
        {
            auto temp = node->left;

            // update the two nodes
            node->left = temp->right;
            if (temp->right != this->invalidNode())
                temp->right->parent = node;
            temp->right = node;
            temp->parent = node->parent;
            node->parent = temp;

            // update the parent
            if (rootParent->parent == node)
            {
                rootParent->parent = temp;
                return;
            }
            if (temp->parent->left == node)
                temp->parent->left = temp;
            else
                temp->parent->right = temp;
        }

        void removeNode(node *node)
        {
            if (node->color == RED)
            {
                if (node->left != this->invalidNode() && node->right != this->invalidNode())
                {
                    // child x 2
                    // find successor, then fill 'node' with successor
                    auto successor = node->right;
                    while (successor->left != this->invalidNode())
                        successor = successor->left;
                    node->key = successor->key;
                    node->value = successor->value;
                    this->removeNode(successor);
                }
                else if (node->left != this->invalidNode())
                {
                    // only left child
                    // fill 'node' with left child
                    node->key = node->left->key;
                    node->value = node->left->value;
                    node->color = node->left->color;
                    this->removeNode(node->left);
                }
                else if (node->right != this->invalidNode())
                {
                    // only right child
                    // fill 'node' with right child
                    node->key = node->right->key;
                    node->value = node->right->value;
                    node->color = node->right->color;
                    this->removeNode(node->right);
                }
                else
                {
                    // no child
                    if (node->parent == this->invalidNode())
                    {
                        delete node;
                        rootParent->parent = rootParent;
                        rootParent->left = rootParent;
                        rootParent->right = rootParent;
                        return;
                    }

                    if (node->parent->left == node)
                        node->parent->left = invalidNode();
                    else
                        node->parent->right = invalidNode();

                    delete node;
                }
            }
            else
            {
                if (node->left != this->invalidNode() && node->right != this->invalidNode())
                {
                    // child x 2
                    // find successor, then fill 'node' with successor
                    auto successor = node->right;
                    while (successor->left != this->invalidNode())
                        successor = successor->left;
                    node->key = successor->key;
                    node->value = successor->value;
                    this->removeNode(successor);
                }
                else if (node->left != this->invalidNode())
                {
                    // only left child
                    // fill 'node' with left child
                    node->key = node->left->key;
                    node->value = node->left->value;
                    this->removeNode(node->left);
                }
                else if (node->right != this->invalidNode())
                {
                    // only right child
                    // fill 'node' with right child
                    node->key = node->right->key;
                    node->value = node->right->value;
                    this->removeNode(node->right);
                }
                else
                {
                    // no child. As the black node deleted is a leaf, fixup
                    // is neccesary after delete.

                    if (node->parent == this->invalidNode())
                    {
                        // 'node' is root
                        delete node;
                        rootParent->parent = rootParent;
                        rootParent->left = rootParent;
                        rootParent->right = rootParent;
                        return;
                    }

                    if (node->parent->left == node)
                    {
                        node->parent->left = invalidNode();
                        if (node->parent->right != this->invalidNode() && node->parent->right->color == RED)
                        {
                            node->parent->right->color = BLACK;
                            leftRotate(node->parent);
                        }
                    }
                    else
                    {
                        node->parent->right = invalidNode();
                        if (node->parent->left != this->invalidNode() && node->parent->left->color == RED)
                        {
                            node->parent->left->color = BLACK;
                            rightRotate(node->parent);
                        }
                    }

                    if (node->parent->left == this->invalidNode() && node->parent->right == this->invalidNode() && node->parent->parent != this->invalidNode())
                    {
                        // you can guess, 'node->parent->parent' must be RED
                        rightRotate(node->parent->parent);
                    }

                    delete node;
                }
            }
        }

        node *search(const KeyType &key) const
        {
            auto curr = rootParent->parent;
            while ((curr->left != this->invalidNode()) | (curr->right != this->invalidNode()))
            {
                if (curr->key == key)
                {
                    break;
                }

                if (cmp(key, curr->key) == 0)
                {
                    if (curr->left->nil)
                        break;
                    curr = curr->left;
                }
                else
                {
                    if (curr->right->nil)
                        break;
                    curr = curr->right;
                }
            }

            if (curr->nil || (curr->key != key))
                return nullptr;
            return curr;
        }

        node *insert(KeyType key)
        {
            node *newNode;
            node *node = search(key);
            if (node != nullptr)
                return node;

            newNode = node = new map<KeyType, ValueType>::node(this->invalidNode());
            node->key = key;

            // whether first node
            if (rootParent->parent == rootParent)
            {
                rootParent->left = node;
                rootParent->right = node;
                rootParent->parent = node;
                node->parent = rootParent;
                node->color = BLACK;
                return newNode;
            }

            // navigate to the desired positon of new node
            map<KeyType, ValueType>::node *curr = rootParent->parent;
            while ((curr->left != this->invalidNode()) | (curr->right != this->invalidNode()))
            {
                if (cmp(key, curr->key) == 0)
                {
                    if (curr->left->nil)
                        break;
                    curr = curr->left;
                }
                else
                {
                    if (curr->right->nil)
                        break;
                    curr = curr->right;
                }
            }

            // link new node and its parent
            node->parent = curr;
            if (cmp(key, curr->key) == 0)
            {
                curr->left = node;
                if (curr == rootParent->left)
                    rootParent->left = node;
            }
            else
            {
                curr->right = node;
                if (curr == rootParent->right)
                    rootParent->right = node;
            }

            // update the tree recursively to keep its properties if needed
            while (curr->color == RED && curr->parent != this->invalidNode())
            {
                bool isRight = (curr == curr->parent->right);
                map<KeyType, ValueType>::node *uncle;
                if (isRight)
                    uncle = curr->parent->left;
                else
                    uncle = curr->parent->right;

                if (uncle == this->invalidNode())
                {
                    curr->color = BLACK;
                    curr->parent->color = RED;
                    if (uncle == curr->parent->right)
                    {
                        rightRotate(curr->parent);
                    }
                    else
                    {
                        leftRotate(curr->parent);
                    }
                    break;
                }
                else if (uncle->color == RED)
                {
                    curr->color = BLACK;
                    uncle->color = BLACK;
                    curr->parent->color = RED;
                    curr = curr->parent;
                }
                else
                {
                    curr->color = BLACK;
                    curr->parent->color = RED;

                    if (isRight)
                    {
                        if (node == curr->left)
                        {
                            rightRotate(curr);
                            curr = node;
                        }
                        leftRotate(curr->parent);
                    }
                    else
                    {
                        if (node == curr->right)
                        {
                            leftRotate(curr);
                            curr = node;
                        }
                        rightRotate(curr->parent);
                    }
                }
                rootParent->parent->color = BLACK;
            }

            this->size++;

            return newNode;
        }

        bool remove(const KeyType &key)
        {
            // find the node to be deleted
            auto node = search(key);
            if (node == nullptr)
                return 0;

            this->removeNode(node);
            (this->size)--;
            return 1;
        }

        int getSize() const
        {
            return size;
        }

        node *invalidNode() const
        {
            return rootParent;
        }
    };

    template <typename ValueType>
    class vector : public Allocatable
    {
    public:
        vector() = default;
        ~vector() {}

        ValueType *begin;
        ValueType *end;
        ValueType *storageEnd;

        ValueType &back()
        {
            return *(end - 1);
        }

        void push_back(ValueType &val)
        {
            if (end == storageEnd)
            {
                size_t newSize = ((storageEnd - begin) + 8) * sizeof(ValueType);
                ValueType *newBegin = reinterpret_cast<ValueType *>(_sceShaccCgHeapAlloc(newSize));
                sceClibMemcpy(newBegin, begin, end - begin);
                storageEnd = reinterpret_cast<ValueType *>(newBegin + newSize / sizeof(ValueType));
                end = reinterpret_cast<ValueType *>(newBegin + (end - begin));
                begin = reinterpret_cast<ValueType *>(newBegin);
            }

            end++;
            back() = val;
        }

        void pop_back()
        {
            end--;
        }

        size_t size()
        {
            return (end - begin) / sizeof(ValueType);
        }
    };

    struct BufferInfo
    {
        uint32_t storage;
        uint32_t readwrite;
        uint32_t strip;
        uint32_t symbols;

        BufferInfo() : storage(0), readwrite(0), strip(0), symbols(0) {}
    };

    class WarningContainer : public Allocatable
    {
    public:
        WarningContainer() = default;
        WarningContainer(WarningContainer &container) : refCount(0), reset(false), disabledWarnings(container.disabledWarnings), elevatedWarnings(container.elevatedWarnings)  {}

        uint32_t refCount;
        bool reset;
        set<uint32_t> disabledWarnings;
        set<uint32_t> elevatedWarnings;

        WarningContainer *retain()
        {
            _AtomicIncrement(&refCount);
            return this;
        }

        void release()
        {
            if (_AtomicDecrement(&refCount) == 0)
                delete this;
        }
    };
}

extern "C" void ProcessPragma_Warning_PushWarningState(uint8_t *object)
{
    vector<WarningContainer *> *vec = reinterpret_cast<vector<WarningContainer *> *>(object + 0x18);
    WarningContainer *oldContainer = *reinterpret_cast<WarningContainer **>(*reinterpret_cast<uint8_t **>(object + 0x10) + 0x60);
    WarningContainer *newContainer = new WarningContainer(*oldContainer);

    vec->push_back(newContainer);
    newContainer->retain();

    *reinterpret_cast<WarningContainer **>(*reinterpret_cast<uint8_t **>(object + 0x10) + 0x60) = newContainer;
    oldContainer->release();
    newContainer->retain();
}

extern "C" bool ProcessPragma_Warning_PopWarningState(uint8_t *object)
{
    vector<WarningContainer *> *vec = reinterpret_cast<vector<WarningContainer *> *>(object + 0x18);
    WarningContainer *oldContainer = *reinterpret_cast<WarningContainer **>(*reinterpret_cast<uint8_t **>(object + 0x10) + 0x60);
    WarningContainer *newContainer;

    if (vec->size() == 1)
    {
        return false;
    }

    vec->back() = nullptr;
    vec->pop_back();
    oldContainer->release();

    newContainer = vec->back();
    *reinterpret_cast<WarningContainer **>(*reinterpret_cast<uint8_t **>(object + 0x10) + 0x60) = newContainer;
    oldContainer->release();
    newContainer->retain();

    return true;
}

extern "C" void ProcessPragma_Warning_ResetWarningContainer(uint8_t *object)
{
    vector<WarningContainer *> *vec = reinterpret_cast<vector<WarningContainer *> *>(object + 0x18);
    WarningContainer *oldContainer = *reinterpret_cast<WarningContainer **>(*reinterpret_cast<uint8_t **>(object + 0x10) + 0x60);
    WarningContainer *newContainer;

    if (oldContainer->reset)
    {
        newContainer = new WarningContainer(*oldContainer);

        *reinterpret_cast<WarningContainer **>(*reinterpret_cast<uint8_t **>(object + 0x10) + 0x60) = newContainer;
        oldContainer->release();
        newContainer->retain();

        vec->back() = newContainer;
        oldContainer->release();
        newContainer->retain();
    }
}

extern "C" void ProcessPragma_Warning_RemoveDiagnostic(void *p, uint32_t key)
{
    set<uint32_t> *diagnosticSet = reinterpret_cast<set<uint32_t> *>(p);

    diagnosticSet->remove(key);
}

extern "C" BufferInfo *ProcessPragma_Buffer_GetBufferInfo(void *p, uint32_t key)
{
    map<uint32_t, BufferInfo>::node *bufferNode;
    map<uint32_t, BufferInfo> *bufferMap = reinterpret_cast<map<uint32_t, BufferInfo> *>(p);

    bufferNode = bufferMap->search(key);
    if (bufferNode != nullptr)
        return &bufferNode->value;

    bufferNode = bufferMap->insert(key);

    return &bufferNode->value;
}